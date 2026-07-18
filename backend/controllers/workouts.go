package controllers

import (
	"database/sql"
	"strconv"
	"time"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

// Exercises/Sets in CreateWorkoutRequest each cap at max=500 independently (models.go),
// which doesn't bound their product — a request with 500 exercises x 500 sets (250,000
// rows) still passes those tags. This struct-level check enforces the total-sets bound
// (models.MaxWorkoutSets) that CreateWorkoutWithProgression's single-transaction
// processing actually needs, since db.DB.SetMaxOpenConns(1) means that transaction
// holds the process's only SQLite connection for the whole request.
func init() {
	validate.RegisterStructValidation(func(sl validator.StructLevel) {
		req := sl.Current().Interface().(models.CreateWorkoutRequest)
		total := 0
		for _, ex := range req.Exercises {
			total += len(ex.Sets)
		}
		if total > models.MaxWorkoutSets {
			sl.ReportError(req.Exercises, "Exercises", "Exercises", "maxtotalsets", "")
		}
	}, models.CreateWorkoutRequest{})
}

func (h *Handler) ListWorkouts(c *gin.Context) {
	uid := middleware.UserID(c)
	f := stores.WorkoutFilter{Limit: 20, Query: c.Query("q")}
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 100 {
		f.Limit = l
	}
	if o, err := strconv.Atoi(c.Query("offset")); err == nil && o >= 0 {
		f.Offset = o
	}
	workouts, err := h.s.Workout.List(uid, f)
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, workouts)
}

func (h *Handler) GetWorkout(c *gin.Context) {
	uid := middleware.UserID(c)
	wid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid workout id")
		return
	}
	w, err := h.s.Workout.Get(uid, wid)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "workout not found")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, w)
}

func (h *Handler) CreateWorkout(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.CreateWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	if req.StartedAt.IsZero() {
		req.StartedAt = time.Now()
	}
	// Snapshot, insert, and stage routine target suggestions in one transaction (issue
	// #40) — closes a TOCTOU race where two concurrent submissions could both read the
	// same stale prior best. Staging is still best-effort internally: a failure there
	// never fails the already-saved workout.
	w, progression, err := h.s.CreateWorkoutWithProgression(uid, req)
	if utils.IsForeignKeyViolation(err) {
		utils.BadRequest(c, "one or more exercises do not exist")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	w.Progression = progression
	utils.Created(c, w)
}

func (h *Handler) UpdateWorkout(c *gin.Context) {
	uid := middleware.UserID(c)
	wid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid workout id")
		return
	}
	var req models.CreateWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	w, err := h.s.Workout.Update(uid, wid, req)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "workout not found")
		return
	}
	if utils.IsForeignKeyViolation(err) {
		utils.BadRequest(c, "one or more exercises do not exist")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, w)
}

func (h *Handler) DeleteWorkout(c *gin.Context) {
	uid := middleware.UserID(c)
	wid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid workout id")
		return
	}
	n, err := h.s.Workout.Delete(uid, wid)
	if utils.DBError(c, err) {
		return
	}
	if n == 0 {
		utils.NotFound(c, "workout not found")
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

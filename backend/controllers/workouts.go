package controllers

import (
	"database/sql"
	"log"
	"strconv"
	"time"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

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
	w, err := h.s.Workout.Create(uid, req)
	if utils.IsForeignKeyViolation(err) {
		utils.BadRequest(c, "one or more exercises do not exist")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	// Auto-progress the routine's per-set targets (issue #40). Best-effort: a
	// failure here must never fail the already-saved workout — log and move on.
	if p := progressRoutine(h, uid, req); p != nil {
		w.Progression = p
	}
	utils.Created(c, w)
}

// progressRoutine bumps the source routine's targets for the sets the user beat
// this workout, returning a summary for the finish toast (nil if nothing changed
// or the workout wasn't from a routine). Only sets carrying a program_set_id are
// considered; the store enforces ownership.
func progressRoutine(h *Handler, uid int64, req models.CreateWorkoutRequest) *models.ProgressionResult {
	if req.ProgramID == nil {
		return nil
	}
	var inputs []stores.ProgressInput
	for _, ex := range req.Exercises {
		for _, s := range ex.Sets {
			if s.ProgramSetID == nil || s.IsWarmup {
				continue
			}
			inputs = append(inputs, stores.ProgressInput{
				ProgramSetID: *s.ProgramSetID,
				Weight:       s.Weight,
				Reps:         s.Reps,
			})
		}
	}
	if len(inputs) == 0 {
		return nil
	}
	name, count, err := h.s.Program.ProgressTargets(uid, *req.ProgramID, inputs)
	if err != nil {
		log.Printf("[workouts/progress] uid=%d program=%d: %v", uid, *req.ProgramID, err)
		return nil
	}
	if count == 0 {
		return nil
	}
	return &models.ProgressionResult{ProgramID: *req.ProgramID, ProgramName: name, Count: count}
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

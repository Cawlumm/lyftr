package controllers

import (
	"database/sql"
	"errors"
	"strconv"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func (h *Handler) ListExercises(c *gin.Context) {
	f := stores.ExerciseFilter{
		Query:       c.Query("q"),
		MuscleGroup: c.Query("muscle_group"),
		Category:    c.Query("category"),
		Equipment:   c.Query("equipment"),
		Limit:       100,
	}
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 2000 {
		f.Limit = l
	}
	exercises, err := h.s.Exercise.Search(c.Request.Context(), f)
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, exercises)
}

func (h *Handler) GetExercise(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid exercise id")
		return
	}
	e, err := h.s.Exercise.Get(id)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "exercise not found")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, e)
}

func (h *Handler) GetExercisePRs(c *gin.Context) {
	uid := middleware.UserID(c)
	exerciseID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid exercise id")
		return
	}
	pr, err := h.s.Workout.PRForExercise(uid, exerciseID)
	if err == sql.ErrNoRows {
		utils.OK(c, nil)
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, gin.H{
		"weight":        pr.Weight,
		"reps":          pr.Reps,
		"estimated_1rm": pr.Weight * (1 + float64(pr.Reps)/30.0),
		"date":          pr.Date,
		"workout_id":    pr.WorkoutID,
	})
}

func (h *Handler) GetExerciseHistory(c *gin.Context) {
	uid := middleware.UserID(c)
	exerciseID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid exercise id")
		return
	}
	limit := 20
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	history, err := h.s.Workout.HistoryForExercise(uid, exerciseID, limit)
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, history)
}

// RefreshExerciseCache re-reads the catalog rows this instance already holds and
// applies any upstream edits.
//
// Not a re-import: Lyftr does not keep a copy of open-exercise-db, and this
// endpoint does not create one. New exercises appear the way every cached row
// did — the first time a search returns them.
func (h *Handler) RefreshExerciseCache(c *gin.Context) {
	n, err := h.s.Exercise.RefreshCached(c.Request.Context())
	if errors.Is(err, stores.ErrNoCatalog) {
		utils.BadRequest(c, "no exercise catalog configured")
		return
	}
	if err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	utils.OK(c, gin.H{"refreshed": n})
}

// ExerciseCacheStatus reports how many catalog rows this instance holds.
func (h *Handler) ExerciseCacheStatus(c *gin.Context) {
	count, err := h.s.Exercise.CachedCount()
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, gin.H{"count": count})
}

// ClearExerciseCache drops cached rows nothing references.
func (h *Handler) ClearExerciseCache(c *gin.Context) {
	n, err := h.s.Exercise.ClearUnreferenced()
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, gin.H{"cleared": n})
}

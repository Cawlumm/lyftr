package controllers

import (
	"database/sql"
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
	exercises, err := h.s.Exercise.List(f)
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

// SyncExercises is an admin-only endpoint to re-pull from ExerciseDB.
func (h *Handler) SyncExercises(c *gin.Context) {
	if err := h.s.Exercise.Sync(); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	count, err := h.s.Exercise.Count()
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, gin.H{"synced": true, "total": count})
}

// ExerciseSeedStatus returns exercise count and whether seeding is running.
func (h *Handler) ExerciseSeedStatus(c *gin.Context) {
	utils.OK(c, h.s.Exercise.SeedStatus())
}

// ResetExercises wipes the exercises table and triggers a fresh seed in background.
func (h *Handler) ResetExercises(c *gin.Context) {
	if err := h.s.Exercise.Reset(); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	utils.OK(c, gin.H{"reset": true, "message": "exercises wiped, re-seeding in background"})
}

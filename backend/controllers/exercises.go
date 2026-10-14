package controllers

import (
	"database/sql"
	"errors"
	"log"
	"strconv"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

// requestLocale is the language the reader asked for. It is a query parameter, not a
// header, so a URL names the whole response. Absent or malformed means English.
func requestLocale(c *gin.Context) string { return stores.NormalizeLocale(c.Query("locale")) }

// requestLanguage is its primary language ("pt-BR" -> "pt"), for upstreams such as
// Open Food Facts that key their names by language alone.
func requestLanguage(c *gin.Context) string { return stores.BaseLanguage(requestLocale(c)) }

func (h *Handler) ListExercises(c *gin.Context) {
	f := stores.ExerciseFilter{
		Query:       c.Query("q"),
		MuscleGroup: c.Query("muscle_group"),
		Category:    c.Query("category"),
		Equipment:   c.Query("equipment"),
		Locale:      requestLocale(c),
		Limit:       100,
	}
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 2000 {
		f.Limit = l
	}
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 1 {
		f.Page = p
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
		utils.Fail(c, utils.CodeInvalidExerciseID, nil)
		return
	}
	e, err := h.s.Exercise.Get(id, requestLocale(c))
	if err == sql.ErrNoRows {
		utils.Fail(c, utils.CodeExerciseNotFound, nil)
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
		utils.Fail(c, utils.CodeInvalidExerciseID, nil)
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
		utils.Fail(c, utils.CodeInvalidExerciseID, nil)
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

// RefreshExerciseCache runs the scheduled catalog pass now, importing every upstream
// exercise in English and refreshing translations for every held one. `refreshed` is
// how many exercises the English pass recorded.
func (h *Handler) RefreshExerciseCache(c *gin.Context) {
	n, err := h.s.Exercise.RefreshCached(c.Request.Context())
	if errors.Is(err, stores.ErrNoCatalog) {
		utils.Fail(c, utils.CodeNoExerciseCatalog, nil)
		return
	}
	if errors.Is(err, stores.ErrCatalogUnreachable) {
		log.Printf("exercises: refresh could not reach the catalog: %v", err)
		utils.Fail(c, utils.CodeCatalogUnreachable, nil)
		return
	}
	if utils.DBError(c, err) {
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

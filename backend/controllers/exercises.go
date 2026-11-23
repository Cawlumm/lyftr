package controllers

import (
	"database/sql"
	"errors"
	"log"
	"slices"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
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

// filterParam reads a catalogue filter. The values are lowercase slugs, and a filter that
// matches nothing is answered with an empty list rather than an error, so `muscle_group=Chest`
// used to look exactly like a muscle with no exercises.
func filterParam(c *gin.Context, key string) string {
	return strings.ToLower(strings.TrimSpace(c.Query(key)))
}

func (h *Handler) ListExercises(c *gin.Context) {
	f := stores.ExerciseFilter{
		Query:       c.Query("q"),
		MuscleGroup: filterParam(c, "muscle_group"),
		Category:    filterParam(c, "category"),
		Equipment:   filterParam(c, "equipment"),
		Locale:      requestLocale(c),
		Limit:       100,
		UserID:      middleware.UserID(c),
		Mine:        c.Query("mine") == "true",
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
	e, err := h.s.Exercise.Get(id, requestLocale(c), middleware.UserID(c))
	if err == sql.ErrNoRows {
		utils.Fail(c, utils.CodeExerciseNotFound, nil)
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, e)
}

// exerciseHidden answers 404 and reports true when id is another user's custom exercise.
// An id that matches nothing is not an error here: PRs and history for it are simply empty.
func (h *Handler) exerciseHidden(c *gin.Context, uid, id int64) bool {
	err := h.s.Exercise.VisibleTo(uid, []int64{id})
	if errors.Is(err, stores.ErrExerciseNotVisible) {
		utils.Fail(c, utils.CodeExerciseNotFound, nil)
		return true
	}
	return utils.DBError(c, err)
}

func (h *Handler) GetExercisePRs(c *gin.Context) {
	uid := middleware.UserID(c)
	exerciseID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Fail(c, utils.CodeInvalidExerciseID, nil)
		return
	}
	if h.exerciseHidden(c, uid, exerciseID) {
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
	if h.exerciseHidden(c, uid, exerciseID) {
		return
	}
	history, err := h.s.Workout.HistoryForExercise(uid, exerciseID, limit)
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, history)
}

// RefreshExerciseCache runs the scheduled catalog pass now, importing every upstream
// exercise in English and refreshing translations for every held one. `refreshed` is
// how many exercises the English pass recorded. `confirm_removals=true` accepts one pass
// in which the catalog lists under half of the exercises held.
func (h *Handler) RefreshExerciseCache(c *gin.Context) {
	refresh := h.s.Exercise.RefreshCached
	if c.Query("confirm_removals") == "true" {
		refresh = h.s.Exercise.RefreshCachedConfirmed
	}
	n, err := refresh(c.Request.Context())
	if errors.Is(err, stores.ErrNoCatalog) {
		utils.Fail(c, utils.CodeNoExerciseCatalog, nil)
		return
	}
	if errors.Is(err, stores.ErrSyncRunning) {
		utils.Fail(c, utils.CodeExerciseSyncRunning, nil)
		return
	}
	if errors.Is(err, stores.ErrCatalogShrank) {
		log.Printf("exercises: refresh refused a shrunken catalog: %v", err)
		utils.Fail(c, utils.CodeExerciseCatalogShrank, nil)
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

// ExerciseCacheStatus reports how many catalog rows this instance holds and how catalog
// passes are going.
func (h *Handler) ExerciseCacheStatus(c *gin.Context) {
	st, err := h.s.Exercise.CacheStatus()
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, st)
}

// customExerciseFailure maps a custom-exercise store error to its response and reports
// whether it wrote one.
func customExerciseFailure(c *gin.Context, err error, name string) bool {
	var tax *stores.TaxonomyError
	switch {
	case err == nil:
		return false
	case errors.As(err, &tax):
		utils.Fail(c, utils.CodeInvalidTaxonomy, map[string]any{"field": tax.Field})
	case errors.Is(err, stores.ErrExerciseNotFound):
		utils.Fail(c, utils.CodeExerciseNotFound, nil)
	case errors.Is(err, stores.ErrNotCustom):
		utils.Fail(c, utils.CodeExerciseNotCustom, nil)
	case errors.Is(err, stores.ErrNameTaken):
		utils.Fail(c, utils.CodeExerciseNameTaken, map[string]any{"name": name})
	case errors.Is(err, stores.ErrCustomLimit):
		utils.Fail(c, utils.CodeCustomExerciseLimit, map[string]any{"limit": stores.MaxCustomExercises})
	case errors.Is(err, stores.ErrInvalidMergeTarget):
		utils.Fail(c, utils.CodeInvalidMergeTarget, nil)
	default:
		return utils.DBError(c, err)
	}
	return true
}

// bindCustomExercise reads and checks a create/update body, reporting whether it answered.
func bindCustomExercise(c *gin.Context) (models.CreateExerciseRequest, bool) {
	var req models.CreateExerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return req, false
	}
	req = stores.NormalizeCustom(req)
	if !checkInstructions(c, req.Instructions) {
		return req, false
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return req, false
	}
	if strings.ContainsFunc(req.Name, unicode.IsControl) {
		utils.Fail(c, utils.CodeDisplayNameControlChars, nil)
		return req, false
	}
	return req, true
}

// checkInstructions applies the step limits to an already-normalized list, reporting
// whether it passed. Normalization has dropped empty steps, so the counts are of real ones.
func checkInstructions(c *gin.Context, steps []string) bool {
	switch {
	case len(steps) > models.MaxInstructionSteps:
		utils.Fail(c, utils.CodeInstructionsTooMany, map[string]any{"max": models.MaxInstructionSteps})
	case slices.ContainsFunc(steps, func(s string) bool { return strings.ContainsFunc(s, unicode.IsControl) }):
		utils.Fail(c, utils.CodeInstructionControlChars, nil)
	case slices.ContainsFunc(steps, func(s string) bool { return utf8.RuneCountInString(s) > models.MaxInstructionChars }):
		utils.Fail(c, utils.CodeInstructionTooLong, map[string]any{"max": models.MaxInstructionChars})
	case utf8.RuneCountInString(models.StepsToText(steps)) > models.MaxInstructionsText:
		utils.Fail(c, utils.CodeInstructionsTextTooLong, map[string]any{"max": models.MaxInstructionsText})
	default:
		return true
	}
	return false
}

func exerciseIDParam(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Fail(c, utils.CodeInvalidExerciseID, nil)
		return 0, false
	}
	return id, true
}

func (h *Handler) CreateExercise(c *gin.Context) {
	req, ok := bindCustomExercise(c)
	if !ok {
		return
	}
	e, err := h.s.Exercise.CreateCustom(middleware.UserID(c), req)
	if customExerciseFailure(c, err, req.Name) {
		return
	}
	utils.Created(c, e)
}

func (h *Handler) UpdateExercise(c *gin.Context) {
	id, ok := exerciseIDParam(c)
	if !ok {
		return
	}
	req, ok := bindCustomExercise(c)
	if !ok {
		return
	}
	e, err := h.s.Exercise.UpdateCustom(middleware.UserID(c), id, req)
	if customExerciseFailure(c, err, req.Name) {
		return
	}
	utils.OK(c, e)
}

func (h *Handler) ArchiveExercise(c *gin.Context) {
	id, ok := exerciseIDParam(c)
	if !ok {
		return
	}
	e, err := h.s.Exercise.Archive(middleware.UserID(c), id)
	if customExerciseFailure(c, err, "") {
		return
	}
	utils.OK(c, e)
}

func (h *Handler) UnarchiveExercise(c *gin.Context) {
	id, ok := exerciseIDParam(c)
	if !ok {
		return
	}
	uid := middleware.UserID(c)
	e, err := h.s.Exercise.Unarchive(uid, id)
	if errors.Is(err, stores.ErrNameTaken) {
		// The row's own name is what collided, and the failed write left it untouched.
		if cur, gerr := h.s.Exercise.Get(id, "", uid); gerr == nil {
			e = cur
		}
	}
	if customExerciseFailure(c, err, e.Name) {
		return
	}
	utils.OK(c, e)
}

func (h *Handler) ExerciseUsage(c *gin.Context) {
	id, ok := exerciseIDParam(c)
	if !ok {
		return
	}
	into, _ := strconv.ParseInt(c.Query("into"), 10, 64)
	u, err := h.s.Exercise.Usage(middleware.UserID(c), id, into)
	if customExerciseFailure(c, err, "") {
		return
	}
	utils.OK(c, u)
}

func (h *Handler) MergeExercise(c *gin.Context) {
	id, ok := exerciseIDParam(c)
	if !ok {
		return
	}
	var req models.MergeExerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}
	res, err := h.s.Exercise.Merge(middleware.UserID(c), id, req.IntoID)
	if customExerciseFailure(c, err, "") {
		return
	}
	utils.OK(c, res)
}

// exercisesVisible answers UNKNOWN_EXERCISES and reports false when any id is another
// user's custom exercise, so a write never reaches the foreign key with an id the caller
// may not use. Ids the caller merged away are rewritten in place to the merge target.
func (h *Handler) exercisesVisible(c *gin.Context, uid int64, refs []*int64) bool {
	ids := make([]int64, len(refs))
	for i, r := range refs {
		ids[i] = *r
	}
	err := h.s.Exercise.VisibleTo(uid, ids)
	if errors.Is(err, stores.ErrExerciseNotVisible) {
		utils.Fail(c, utils.CodeUnknownExercises, nil)
		return false
	}
	if utils.DBError(c, err) {
		return false
	}
	targets, err := h.s.Exercise.MergedTargets(uid, ids)
	if utils.DBError(c, err) {
		return false
	}
	for _, r := range refs {
		if to, ok := targets[*r]; ok {
			*r = to
		}
	}
	return true
}

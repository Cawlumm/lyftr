package controllers

import (
	"database/sql"
	"strconv"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func (h *Handler) ListPrograms(c *gin.Context) {
	uid := middleware.UserID(c)
	f := stores.ProgramFilter{Limit: 20, Query: c.Query("q")}
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 100 {
		f.Limit = l
	}
	if o, err := strconv.Atoi(c.Query("offset")); err == nil && o >= 0 {
		f.Offset = o
	}
	programs, err := h.s.Program.List(uid, f)
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, programs)
}

func (h *Handler) GetProgram(c *gin.Context) {
	uid := middleware.UserID(c)
	pid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid program id")
		return
	}
	p, err := h.s.Program.Get(uid, pid)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "program not found")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, p)
}

// validateProgramDays enforces the day-layer rules that struct tags can't express.
// It runs on the NORMALIZED request (legacy flat exercises already wrapped into a
// Day 1) so the checks see the same shape the store will persist.
func validateProgramDays(req models.CreateProgramRequest) string {
	if len(req.Days) > 14 {
		return "a program can have at most 14 days"
	}
	trainingDays := 0
	for _, d := range req.Days {
		if d.IsRestDay {
			if len(d.Exercises) > 0 {
				return "a rest day cannot contain exercises"
			}
			continue
		}
		trainingDays++
	}
	if trainingDays == 0 {
		return "a program needs at least one training day"
	}
	return ""
}

func (h *Handler) CreateProgram(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.CreateProgramRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	req = stores.NormalizeProgramReq(req)
	if msg := validateProgramDays(req); msg != "" {
		utils.BadRequest(c, msg)
		return
	}
	p, err := h.s.Program.Create(uid, req)
	if utils.IsForeignKeyViolation(err) {
		utils.BadRequest(c, "one or more exercises do not exist")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.Created(c, p)
}

func (h *Handler) UpdateProgram(c *gin.Context) {
	uid := middleware.UserID(c)
	pid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid program id")
		return
	}
	var req models.CreateProgramRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	req = stores.NormalizeProgramReq(req)
	if msg := validateProgramDays(req); msg != "" {
		utils.BadRequest(c, msg)
		return
	}
	p, err := h.s.Program.Update(uid, pid, req)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "program not found")
		return
	}
	if utils.IsForeignKeyViolation(err) {
		utils.BadRequest(c, "one or more exercises do not exist")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, p)
}

func (h *Handler) DeleteProgram(c *gin.Context) {
	uid := middleware.UserID(c)
	pid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid program id")
		return
	}
	n, err := h.s.Program.Delete(uid, pid)
	if utils.DBError(c, err) {
		return
	}
	if n == 0 {
		utils.NotFound(c, "program not found")
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

// ResolveSuggestions accepts/dismisses staged auto-progression suggestions (#40) and
// returns the refreshed program. Ownership is enforced in the store.
func (h *Handler) ResolveSuggestions(c *gin.Context) {
	uid := middleware.UserID(c)
	pid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid program id")
		return
	}
	var req models.ResolveSuggestionsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	p, err := h.s.Program.ResolveSuggestions(uid, pid, req.Accept, req.Dismiss)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "program not found")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, p)
}

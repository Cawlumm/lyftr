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
)

func (h *Handler) ListWeightLogs(c *gin.Context) {
	uid := middleware.UserID(c)
	f := stores.WeightFilter{Limit: 90}
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 1000 {
		f.Limit = l
	}
	if o, err := strconv.Atoi(c.Query("offset")); err == nil && o >= 0 {
		f.Offset = o
	}

	// `from`/`to` name days in the user's diary, and every row carries the day it was
	// filed under, so this is a range over stored days: no zone, no conversion, nothing
	// that can move later. Validated through resolveQueryDay so a range bound and a
	// single-day lookup cannot disagree about what a day string is.
	//
	// Day-only is also what every peer range API takes (Fitbit's food log `date`,
	// Garmin's `calendarDate`). An instant-bounded RFC3339 variant used to live here
	// for exact windows; no client ever sent one, and it was a second way to ask the
	// same question through a different column.
	if from := c.Query("from"); from != "" {
		day, ok := h.resolveQueryDay(uid, from)
		if !ok {
			utils.BadRequest(c, "From must be in YYYY-MM-DD format.")
			return
		}
		f.FromDay = &day
	}
	if to := c.Query("to"); to != "" {
		day, ok := h.resolveQueryDay(uid, to)
		if !ok {
			utils.BadRequest(c, "To must be in YYYY-MM-DD format.")
			return
		}
		f.ToDay = &day
	}

	logs, err := h.s.Weight.List(uid, f)
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, logs)
}

func (h *Handler) LogWeight(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.LogWeightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, utils.BindMessage(err))
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	req.LoggedAt = normalizeLoggedAt(req.LoggedAt)

	day, ok := h.resolveDay(uid, req.LoggedOn, req.LoggedAt)
	if !ok {
		utils.BadRequest(c, "Logged on must be in YYYY-MM-DD format.")
		return
	}
	log, err := h.s.Weight.UpsertForDay(uid, req, day)
	if utils.DBError(c, err) {
		return
	}
	utils.Created(c, log)
}

func (h *Handler) GetWeightLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "That id isn't valid.")
		return
	}
	log, err := h.s.Weight.Get(uid, lid)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "That entry no longer exists.")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, log)
}

func (h *Handler) UpdateWeightLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "That id isn't valid.")
		return
	}
	var req models.LogWeightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, utils.BindMessage(err))
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	req.LoggedAt = normalizeLoggedAt(req.LoggedAt)

	day, ok := h.resolveDay(uid, req.LoggedOn, req.LoggedAt)
	if !ok {
		utils.BadRequest(c, "Logged on must be in YYYY-MM-DD format.")
		return
	}
	log, err := h.s.Weight.Update(uid, lid, req, day)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "That entry no longer exists.")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, log)
}

func (h *Handler) DeleteWeightLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "That id isn't valid.")
		return
	}
	n, err := h.s.Weight.Delete(uid, lid)
	if utils.DBError(c, err) {
		return
	}
	if n == 0 {
		utils.NotFound(c, "That entry no longer exists.")
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

func (h *Handler) GetWeightStats(c *gin.Context) {
	uid := middleware.UserID(c)
	stats, err := h.s.Weight.Stats(uid, h.daysAgoDay(uid, 7), h.daysAgoDay(uid, 30))
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, gin.H{
		"latest":        stats.Latest,
		"starting":      stats.Starting,
		"min":           stats.Min,
		"max":           stats.Max,
		"avg":           stats.Avg,
		"total_entries": stats.TotalEntries,
		"change_7d":     stats.Change7d,
		"change_30d":    stats.Change30d,
	})
}

// normalizeLoggedAt defaults a zero time to now and forces UTC: keeps the wire
// format consistent across deployments and lets a client-supplied offset
// timestamp round-trip cleanly (a non-UTC time.Time otherwise fails to scan back).
func normalizeLoggedAt(t time.Time) time.Time {
	if t.IsZero() {
		t = time.Now()
	}
	return t.UTC()
}

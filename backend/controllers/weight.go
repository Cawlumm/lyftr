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

	// Date params are calendar days in the user's local timezone. We don't know
	// the client's UTC offset, so for bare YYYY-MM-DD we widen the window by ±12h
	// to cover any plausible client TZ. A full RFC3339 timestamp is used exactly.
	if from := c.Query("from"); from != "" {
		if t, exact, ok := parseDayOrTime(from); ok {
			lo := t
			if !exact {
				lo = t.Add(-12 * time.Hour)
			}
			f.From = &lo
		}
	}
	if to := c.Query("to"); to != "" {
		if t, exact, ok := parseDayOrTime(to); ok {
			hi := t
			if !exact {
				hi = t.Add(36 * time.Hour)
			}
			f.To = &hi
		}
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
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	req.LoggedAt = normalizeLoggedAt(req.LoggedAt)

	log, err := h.s.Weight.UpsertForDay(uid, req)
	if utils.DBError(c, err) {
		return
	}
	utils.Created(c, log)
}

func (h *Handler) GetWeightLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid id")
		return
	}
	log, err := h.s.Weight.Get(uid, lid)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "log entry not found")
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
		utils.BadRequest(c, "invalid id")
		return
	}
	var req models.LogWeightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	req.LoggedAt = normalizeLoggedAt(req.LoggedAt)

	log, err := h.s.Weight.Update(uid, lid, req)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "log entry not found")
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
		utils.BadRequest(c, "invalid id")
		return
	}
	n, err := h.s.Weight.Delete(uid, lid)
	if utils.DBError(c, err) {
		return
	}
	if n == 0 {
		utils.NotFound(c, "log entry not found")
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

func (h *Handler) GetWeightStats(c *gin.Context) {
	uid := middleware.UserID(c)
	stats, err := h.s.Weight.Stats(uid)
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

// parseDayOrTime accepts a full RFC3339 timestamp or a bare YYYY-MM-DD. Returns
// the parsed time, whether it was an exact timestamp (don't widen), and success.
func parseDayOrTime(s string) (t time.Time, exact bool, ok bool) {
	if v, err := time.Parse(time.RFC3339, s); err == nil {
		return v, true, true
	}
	if v, err := time.Parse("2006-01-02", s); err == nil {
		return v, false, true
	}
	return time.Time{}, false, false
}

package controllers

import (
	"database/sql"
	"strconv"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func ListWeightLogs(c *gin.Context) {
	uid := middleware.UserID(c)
	limit := 90
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 1000 {
		limit = l
	}
	offset := 0
	if o, err := strconv.Atoi(c.Query("offset")); err == nil && o >= 0 {
		offset = o
	}

	q := `SELECT id, user_id, weight, notes, logged_at, created_at
	      FROM weight_logs WHERE user_id = ?`
	args := []any{uid}

	// Date params are calendar days in the user's local timezone. We don't know
	// the client's UTC offset, so for bare YYYY-MM-DD we widen the window by
	// ±12h to cover any plausible client TZ. Callers that want exact bounds can
	// pass a full RFC3339 timestamp instead.
	if from := c.Query("from"); from != "" {
		if t, exact, ok := parseDayOrTime(from); ok {
			lo := t
			if !exact {
				lo = t.Add(-12 * time.Hour)
			}
			q += ` AND logged_at >= ?`
			args = append(args, lo)
		}
	}
	if to := c.Query("to"); to != "" {
		if t, exact, ok := parseDayOrTime(to); ok {
			hi := t
			if !exact {
				// 24h of the day itself + 12h padding for west-of-UTC clocks.
				hi = t.Add(36 * time.Hour)
			}
			q += ` AND logged_at < ?`
			args = append(args, hi)
		}
	}
	q += ` ORDER BY logged_at DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := db.DB.Query(q, args...)
	if err != nil {
		utils.InternalError(c)
		return
	}
	defer rows.Close()

	logs := []models.WeightLog{}
	for rows.Next() {
		var w models.WeightLog
		rows.Scan(&w.ID, &w.UserID, &w.Weight, &w.Notes, &w.LoggedAt, &w.CreatedAt)
		logs = append(logs, w)
	}
	utils.OK(c, logs)
}

func LogWeight(c *gin.Context) {
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

	if req.LoggedAt.IsZero() {
		// .UTC() so the serialized response doesn't depend on the server's
		// timezone setting (the instant is the same either way; this keeps the
		// wire format consistent across deployments).
		req.LoggedAt = time.Now().UTC()
	}

	res, err := db.DB.Exec(
		`INSERT INTO weight_logs (user_id, weight, notes, logged_at) VALUES (?, ?, ?, ?)`,
		uid, req.Weight, req.Notes, req.LoggedAt,
	)
	if err != nil {
		utils.InternalError(c)
		return
	}

	id, _ := res.LastInsertId()
	var log models.WeightLog
	if err := db.DB.QueryRow(
		`SELECT id, user_id, weight, notes, logged_at, created_at FROM weight_logs WHERE id = ?`, id,
	).Scan(&log.ID, &log.UserID, &log.Weight, &log.Notes, &log.LoggedAt, &log.CreatedAt); err != nil {
		utils.InternalError(c)
		return
	}
	utils.Created(c, log)
}

func GetWeightLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid id")
		return
	}

	var log models.WeightLog
	if err := db.DB.QueryRow(
		`SELECT id, user_id, weight, notes, logged_at, created_at FROM weight_logs WHERE id = ? AND user_id = ?`,
		lid, uid,
	).Scan(&log.ID, &log.UserID, &log.Weight, &log.Notes, &log.LoggedAt, &log.CreatedAt); err != nil {
		utils.NotFound(c, "log entry not found")
		return
	}
	utils.OK(c, log)
}

func UpdateWeightLog(c *gin.Context) {
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

	if req.LoggedAt.IsZero() {
		// .UTC() so the serialized response doesn't depend on the server's
		// timezone setting (the instant is the same either way; this keeps the
		// wire format consistent across deployments).
		req.LoggedAt = time.Now().UTC()
	}

	res, err := db.DB.Exec(
		`UPDATE weight_logs SET weight = ?, notes = ?, logged_at = ? WHERE id = ? AND user_id = ?`,
		req.Weight, req.Notes, req.LoggedAt, lid, uid,
	)
	if err != nil {
		utils.InternalError(c)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		utils.NotFound(c, "log entry not found")
		return
	}

	var log models.WeightLog
	if err := db.DB.QueryRow(
		`SELECT id, user_id, weight, notes, logged_at, created_at FROM weight_logs WHERE id = ?`, lid,
	).Scan(&log.ID, &log.UserID, &log.Weight, &log.Notes, &log.LoggedAt, &log.CreatedAt); err != nil {
		utils.InternalError(c)
		return
	}
	utils.OK(c, log)
}

func DeleteWeightLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid id")
		return
	}

	res, err := db.DB.Exec(`DELETE FROM weight_logs WHERE id = ? AND user_id = ?`, lid, uid)
	if err != nil {
		utils.InternalError(c)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		utils.NotFound(c, "log entry not found")
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

func GetWeightStats(c *gin.Context) {
	uid := middleware.UserID(c)

	var (
		latest, oldest, minW, maxW, avgW sql.NullFloat64
		count                            int
	)
	db.DB.QueryRow(
		`SELECT
		  (SELECT weight FROM weight_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1),
		  (SELECT weight FROM weight_logs WHERE user_id = ? ORDER BY logged_at ASC  LIMIT 1),
		  MIN(weight), MAX(weight), AVG(weight), COUNT(*)
		 FROM weight_logs WHERE user_id = ?`,
		uid, uid, uid,
	).Scan(&latest, &oldest, &minW, &maxW, &avgW, &count)

	change7 := changeOver(uid, 7)
	change30 := changeOver(uid, 30)

	utils.OK(c, gin.H{
		"latest":        latest.Float64,
		"starting":      oldest.Float64,
		"min":           minW.Float64,
		"max":           maxW.Float64,
		"avg":           avgW.Float64,
		"total_entries": count,
		"change_7d":     change7,
		"change_30d":    change30,
	})
}

// parseDayOrTime accepts either a full RFC3339 timestamp or a bare YYYY-MM-DD.
// Returns the parsed time, whether the input was an exact timestamp (so callers
// know not to widen the window), and parse success.
func parseDayOrTime(s string) (t time.Time, exact bool, ok bool) {
	if v, err := time.Parse(time.RFC3339, s); err == nil {
		return v, true, true
	}
	if v, err := time.Parse("2006-01-02", s); err == nil {
		return v, false, true
	}
	return time.Time{}, false, false
}

// changeOver returns latest weight minus the earliest weight within the last
// `days` days. Returns 0 when there are fewer than two entries in the window.
func changeOver(uid int64, days int) float64 {
	cutoff := time.Now().UTC().AddDate(0, 0, -days)
	var latest, earliest sql.NullFloat64
	db.DB.QueryRow(
		`SELECT
		  (SELECT weight FROM weight_logs WHERE user_id = ? AND logged_at >= ? ORDER BY logged_at DESC LIMIT 1),
		  (SELECT weight FROM weight_logs WHERE user_id = ? AND logged_at >= ? ORDER BY logged_at ASC  LIMIT 1)`,
		uid, cutoff, uid, cutoff,
	).Scan(&latest, &earliest)
	if !latest.Valid || !earliest.Valid {
		return 0
	}
	return latest.Float64 - earliest.Float64
}

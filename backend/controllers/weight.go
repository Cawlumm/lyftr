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

	q := `SELECT id, user_id, weight, notes, logged_at, created_at
	      FROM weight_logs WHERE user_id = ?`
	args := []any{uid}

	if from := c.Query("from"); from != "" {
		if t, err := time.Parse("2006-01-02", from); err == nil {
			q += ` AND logged_at >= ?`
			args = append(args, t)
		}
	}
	if to := c.Query("to"); to != "" {
		if t, err := time.Parse("2006-01-02", to); err == nil {
			q += ` AND logged_at < ?`
			args = append(args, t.Add(24*time.Hour))
		}
	}
	q += ` ORDER BY logged_at DESC LIMIT ?`
	args = append(args, limit)

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
		req.LoggedAt = time.Now()
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
	db.DB.QueryRow(
		`SELECT id, user_id, weight, notes, logged_at, created_at FROM weight_logs WHERE id = ?`, id,
	).Scan(&log.ID, &log.UserID, &log.Weight, &log.Notes, &log.LoggedAt, &log.CreatedAt)

	utils.Created(c, log)
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
		req.LoggedAt = time.Now()
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
	db.DB.QueryRow(
		`SELECT id, user_id, weight, notes, logged_at, created_at FROM weight_logs WHERE id = ?`, lid,
	).Scan(&log.ID, &log.UserID, &log.Weight, &log.Notes, &log.LoggedAt, &log.CreatedAt)
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

// changeOver returns latest weight minus the earliest weight within the last
// `days` days. Returns 0 when there are fewer than two entries in the window.
func changeOver(uid int64, days int) float64 {
	cutoff := time.Now().AddDate(0, 0, -days)
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

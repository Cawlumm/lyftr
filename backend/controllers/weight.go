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
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 {
		limit = l
	}

	rows, err := db.DB.Query(
		`SELECT id, user_id, weight, notes, logged_at, created_at
		 FROM weight_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT ?`,
		uid, limit,
	)
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

	var latest, oldest sql.NullFloat64
	var count int
	db.DB.QueryRow(
		`SELECT
		  (SELECT weight FROM weight_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1),
		  (SELECT weight FROM weight_logs WHERE user_id = ? ORDER BY logged_at ASC  LIMIT 1),
		  COUNT(*) FROM weight_logs WHERE user_id = ?`,
		uid, uid, uid,
	).Scan(&latest, &oldest, &count)

	utils.OK(c, gin.H{
		"latest":        latest.Float64,
		"starting":      oldest.Float64,
		"total_entries": count,
	})
}

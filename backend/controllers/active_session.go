package controllers

import (
	"database/sql"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func GetActiveSession(c *gin.Context) {
	uid := middleware.UserID(c)
	var data string
	var updatedAt time.Time
	err := db.DB.QueryRow(
		`SELECT data, updated_at FROM active_sessions WHERE user_id = ?`, uid,
	).Scan(&data, &updatedAt)
	if err == sql.ErrNoRows {
		utils.OK(c, nil)
		return
	}
	if err != nil {
		utils.InternalError(c)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"data": data, "updated_at": updatedAt}})
}

func UpsertActiveSession(c *gin.Context) {
	uid := middleware.UserID(c)
	var body struct {
		Data string `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	_, err := db.DB.Exec(
		`INSERT INTO active_sessions (user_id, data, updated_at)
		 VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
		uid, body.Data,
	)
	if err != nil {
		utils.InternalError(c)
		return
	}
	utils.OK(c, gin.H{"saved": true})
}

func DeleteActiveSession(c *gin.Context) {
	uid := middleware.UserID(c)
	db.DB.Exec(`DELETE FROM active_sessions WHERE user_id = ?`, uid)
	utils.OK(c, gin.H{"deleted": true})
}

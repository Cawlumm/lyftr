package controllers

import (
	"strconv"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func ListFoodLogs(c *gin.Context) {
	uid := middleware.UserID(c)

	// default to today
	date := c.Query("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	rows, err := db.DB.Query(
		`SELECT id, user_id, name, meal, calories, protein, carbs, fat, servings, serving_size, barcode, logged_at, created_at
		 FROM food_logs
		 WHERE user_id = ? AND date(logged_at) = ?
		 ORDER BY logged_at ASC`,
		uid, date,
	)
	if err != nil {
		utils.InternalError(c)
		return
	}
	defer rows.Close()

	logs := []models.FoodLog{}
	for rows.Next() {
		var f models.FoodLog
		rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Meal, &f.Calories, &f.Protein, &f.Carbs, &f.Fat,
			&f.Servings, &f.ServingSize, &f.Barcode, &f.LoggedAt, &f.CreatedAt)
		logs = append(logs, f)
	}
	utils.OK(c, logs)
}

func LogFood(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.LogFoodRequest
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
	if req.Servings == 0 {
		req.Servings = 1
	}

	res, err := db.DB.Exec(
		`INSERT INTO food_logs (user_id, name, meal, calories, protein, carbs, fat, servings, serving_size, barcode, logged_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid, req.Name, req.Meal, req.Calories, req.Protein, req.Carbs, req.Fat,
		req.Servings, req.ServingSize, req.Barcode, req.LoggedAt,
	)
	if err != nil {
		utils.InternalError(c)
		return
	}

	id, _ := res.LastInsertId()
	var f models.FoodLog
	db.DB.QueryRow(
		`SELECT id, user_id, name, meal, calories, protein, carbs, fat, servings, serving_size, barcode, logged_at, created_at
		 FROM food_logs WHERE id = ?`, id,
	).Scan(&f.ID, &f.UserID, &f.Name, &f.Meal, &f.Calories, &f.Protein, &f.Carbs, &f.Fat,
		&f.Servings, &f.ServingSize, &f.Barcode, &f.LoggedAt, &f.CreatedAt)

	utils.Created(c, f)
}

func DeleteFoodLog(c *gin.Context) {
	uid := middleware.UserID(c)
	lid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid id")
		return
	}

	res, err := db.DB.Exec(`DELETE FROM food_logs WHERE id = ? AND user_id = ?`, lid, uid)
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

func GetDailyStats(c *gin.Context) {
	uid := middleware.UserID(c)
	date := c.Query("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	var stats models.DailyStats
	stats.Date = date

	db.DB.QueryRow(
		`SELECT COALESCE(SUM(calories),0), COALESCE(SUM(protein),0),
		        COALESCE(SUM(carbs),0), COALESCE(SUM(fat),0)
		 FROM food_logs WHERE user_id = ? AND date(logged_at) = ?`,
		uid, date,
	).Scan(&stats.TotalCalories, &stats.TotalProtein, &stats.TotalCarbs, &stats.TotalFat)

	db.DB.QueryRow(
		`SELECT COUNT(*) FROM workouts WHERE user_id = ? AND date(started_at) = ?`,
		uid, date,
	).Scan(&stats.WorkoutCount)

	utils.OK(c, stats)
}

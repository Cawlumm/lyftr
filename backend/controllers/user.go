package controllers

import (
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func GetMe(c *gin.Context) {
	uid := middleware.UserID(c)
	var u models.User
	err := db.DB.QueryRow(
		`SELECT id, email, created_at, updated_at FROM users WHERE id = ?`, uid,
	).Scan(&u.ID, &u.Email, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		utils.InternalError(c)
		return
	}
	utils.OK(c, u)
}

func GetSettings(c *gin.Context) {
	uid := middleware.UserID(c)
	var s models.UserSettings
	err := db.DB.QueryRow(
		`SELECT user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target
		 FROM user_settings WHERE user_id = ?`, uid,
	).Scan(&s.UserID, &s.WeightUnit, &s.CalorieTarget, &s.ProteinTarget, &s.CarbTarget, &s.FatTarget)
	if err != nil {
		// Return defaults if not found
		utils.OK(c, models.UserSettings{
			UserID: uid, WeightUnit: "lbs",
			CalorieTarget: 2000, ProteinTarget: 150, CarbTarget: 250, FatTarget: 65,
		})
		return
	}
	utils.OK(c, s)
}

func UpdateSettings(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.UpdateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	db.DB.Exec(
		`INSERT INTO user_settings (user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   weight_unit    = excluded.weight_unit,
		   calorie_target = excluded.calorie_target,
		   protein_target = excluded.protein_target,
		   carb_target    = excluded.carb_target,
		   fat_target     = excluded.fat_target`,
		uid, req.WeightUnit, req.CalorieTarget, req.ProteinTarget, req.CarbTarget, req.FatTarget,
	)

	GetSettings(c)
}

func DeleteAccount(c *gin.Context) {
	uid := middleware.UserID(c)
	_, err := db.DB.Exec(`DELETE FROM users WHERE id = ?`, uid)
	if err != nil {
		utils.InternalError(c)
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

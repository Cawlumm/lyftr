package controllers

import (
	"database/sql"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

var validate = validator.New()

func Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	hash, err := utils.HashPassword(req.Password)
	if err != nil {
		utils.InternalError(c)
		return
	}

	res, err := db.DB.Exec(
		`INSERT INTO users (email, password_hash) VALUES (?, ?)`,
		req.Email, hash,
	)
	if err != nil {
		utils.BadRequest(c, "email already registered")
		return
	}

	userID, _ := res.LastInsertId()

	// Create default settings
	db.DB.Exec(`INSERT INTO user_settings (user_id) VALUES (?)`, userID)

	access, refresh, err := utils.GenerateTokenPair(userID, req.Email)
	if err != nil {
		utils.InternalError(c)
		return
	}

	user := models.User{ID: userID, Email: req.Email}
	utils.Created(c, models.AuthResponse{Token: access, RefreshToken: refresh, User: user})
}

func Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	var user models.User
	err := db.DB.QueryRow(
		`SELECT id, email, password_hash, created_at, updated_at FROM users WHERE email = ?`,
		req.Email,
	).Scan(&user.ID, &user.Email, &user.Password, &user.CreatedAt, &user.UpdatedAt)

	if err == sql.ErrNoRows || !utils.CheckPassword(req.Password, user.Password) {
		utils.Unauthorized(c, "invalid email or password")
		return
	}
	if err != nil {
		utils.InternalError(c)
		return
	}

	access, refresh, err := utils.GenerateTokenPair(user.ID, user.Email)
	if err != nil {
		utils.InternalError(c)
		return
	}

	user.Password = ""
	utils.OK(c, models.AuthResponse{Token: access, RefreshToken: refresh, User: user})
}

func RefreshToken(c *gin.Context) {
	var req models.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	claims, err := utils.ValidateToken(req.RefreshToken)
	if err != nil || claims.Type != "refresh" {
		utils.Unauthorized(c, "invalid refresh token")
		return
	}

	access, refresh, err := utils.GenerateTokenPair(claims.UserID, claims.Email)
	if err != nil {
		utils.InternalError(c)
		return
	}

	utils.OK(c, gin.H{"token": access, "refresh_token": refresh})
}

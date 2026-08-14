package controllers

import (
	"database/sql"
	"errors"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

var validate = validator.New()

// RegistrationClosedMessage is what a rejected signup sees. One constant so the two
// ways of being closed (REGISTRATION=closed, and first-user with the slot taken) are
// indistinguishable to a caller — and so the handler and its tests cannot drift.
const RegistrationClosedMessage = "registration is closed on this server"

// registrationOpen reports whether a new account may be created right now. Errors are
// reported as closed: advertising an open instance because a COUNT failed is the wrong
// direction to fail.
func (h *Handler) registrationOpen() (bool, error) {
	switch config.C.Registration {
	case config.RegistrationClosed:
		return false, nil
	case config.RegistrationFirstUser:
		n, err := h.s.User.Count()
		if err != nil {
			return false, err
		}
		return n == 0, nil
	default:
		return true, nil
	}
}

func (h *Handler) Register(c *gin.Context) {
	// Before binding or hashing: bcrypt on an unauthenticated public endpoint is a free
	// CPU-burn for anyone who finds a closed instance, and the answer does not depend on
	// anything in the body.
	open, err := h.registrationOpen()
	if err != nil {
		utils.DBError(c, err)
		return
	}
	if !open {
		utils.Forbidden(c, RegistrationClosedMessage)
		return
	}

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

	create := h.s.User.Create
	if config.C.Registration == config.RegistrationFirstUser {
		create = h.s.User.CreateFirst
	}

	userID, err := create(req.Email, hash)
	if errors.Is(err, stores.ErrRegistrationClosed) {
		utils.Forbidden(c, RegistrationClosedMessage)
		return
	}
	if utils.IsUniqueViolation(err) {
		utils.Conflict(c, "email already registered")
		return
	}
	if utils.DBError(c, err) {
		return
	}

	access, refresh, err := utils.GenerateTokenPair(userID, req.Email)
	if err != nil {
		utils.InternalError(c)
		return
	}

	user := models.User{ID: userID, Email: req.Email}
	utils.Created(c, models.AuthResponse{Token: access, RefreshToken: refresh, User: user})
}

func (h *Handler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	user, err := h.s.User.GetByEmail(req.Email)
	if err == sql.ErrNoRows {
		utils.Unauthorized(c, "invalid email or password")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	if !utils.CheckPassword(req.Password, user.Password) {
		utils.Unauthorized(c, "invalid email or password")
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

func (h *Handler) RefreshToken(c *gin.Context) {
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

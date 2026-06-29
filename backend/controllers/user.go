package controllers

import (
	"database/sql"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func (h *Handler) GetMe(c *gin.Context) {
	uid := middleware.UserID(c)
	u, err := h.s.User.GetMe(uid)
	if err == sql.ErrNoRows {
		utils.Unauthorized(c, "account no longer exists")
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, u)
}

func (h *Handler) GetSettings(c *gin.Context) {
	uid := middleware.UserID(c)
	s, err := h.s.User.GetSettings(uid)
	if err == sql.ErrNoRows {
		// No row yet — return the defaults.
		utils.OK(c, models.UserSettings{
			UserID: uid, WeightUnit: "lbs",
			CalorieTarget: 2000, ProteinTarget: 150, CarbTarget: 250, FatTarget: 65,
		})
		return
	}
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, s)
}

func (h *Handler) UpdateSettings(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.UpdateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	s, err := h.s.User.UpsertSettings(uid, req)
	if utils.DBError(c, err) {
		return
	}
	utils.OK(c, s)
}

func (h *Handler) DeleteAccount(c *gin.Context) {
	uid := middleware.UserID(c)
	if utils.DBError(c, h.s.User.Delete(uid)) {
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

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
		utils.OK(c, models.DefaultUserSettings(uid))
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
	// Enforce the request tags (weight_unit oneof, targets gte=0) like every other
	// controller — binding alone doesn't run them, so without this an invalid unit
	// or a negative target would be persisted unchecked.
	if err := validate.Struct(req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	// A zone name is only valid if the runtime can load it, so check it here rather
	// than with a struct tag. Storing an unloadable name would be quietly corrosive:
	// every later food query falls back to UTC, so the diary would look subtly wrong
	// with nothing pointing at the cause.
	if req.Timezone != nil {
		// Explicitly reject "", which ParseLocation accepts as "not set" for reads.
		// Sending it here means overwriting a correctly detected zone with a value
		// that silently reverts every day boundary to UTC — a 200 OK, a stored value
		// that is neither null nor rejected, and nothing to point at afterwards.
		if *req.Timezone == "" {
			utils.BadRequest(c, "timezone cannot be empty")
			return
		}
		if _, err := ParseLocation(*req.Timezone); err != nil {
			utils.BadRequest(c, "unknown timezone: "+*req.Timezone)
			return
		}
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

package controllers

import (
	"database/sql"
	"strings"
	"unicode"

	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func (h *Handler) GetMe(c *gin.Context) {
	uid := middleware.UserID(c)
	u, err := h.s.User.GetMe(uid)
	if err == sql.ErrNoRows {
		utils.Unauthorized(c, "That account no longer exists.")
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
		utils.BadRequest(c, utils.BindMessage(err))
		return
	}
	// Trimmed before it is measured, so " Carter " is a 6-character name rather than
	// an 8-character one, and before it is stored, so the greeting never opens with a
	// space. A name of nothing but whitespace trims to "" and so clears the name,
	// which is the same thing an empty field does — there is no third state.
	if req.DisplayName != nil {
		trimmed := strings.TrimSpace(*req.DisplayName)
		// The only characters a name may not contain, and the reasoning is narrow on
		// purpose. Of eight comparable apps — Mastodon, Discourse, Gitea, Nextcloud,
		// Immich, GitLab, FitTrackee, wger — none applies character-level validation to
		// a display name, so emoji, scripts and punctuation are all deliberately
		// allowed: this name is shown to nobody but its owner, and the spoofing that
		// motivates filtering elsewhere needs a second person to deceive.
		//
		// Control characters are the exception, and not for security. TrimSpace has
		// already taken the ones at either end, so what is left is interior: a newline
		// inside a greeting is a layout bug, and a NUL in a text field is never
		// intentional (Django rejects it on every CharField for that reason).
		if strings.ContainsFunc(trimmed, unicode.IsControl) {
			utils.BadRequest(c, "A name can't contain line breaks or other control characters.")
			return
		}
		req.DisplayName = &trimmed
	}
	// Enforce the request tags (weight_unit oneof, targets gte=0) like every other
	// controller — binding alone doesn't run them, so without this an invalid unit
	// or a negative target would be persisted unchecked.
	if err := validate.Struct(req); err != nil {
		utils.BadRequest(c, utils.BindMessage(err))
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
			utils.BadRequest(c, "Timezone can't be empty.")
			return
		}
		if _, err := ParseLocation(*req.Timezone); err != nil {
			utils.BadRequest(c, "Unknown timezone: "+*req.Timezone+".")
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

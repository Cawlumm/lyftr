package controllers

import (
	"log"
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
	// Capture the stored zone before the write so we can tell a first report from a
	// later change (see RederiveLoggedOn).
	prev := "UTC"
	if before, err := h.s.User.GetSettings(uid); err == nil && before.Timezone != "" {
		prev = before.Timezone
	}

	s, err := h.s.User.UpsertSettings(uid, req)
	if utils.DBError(c, err) {
		return
	}

	// The boot backfill had to assume UTC. Now that this user's real zone is known
	// for the first time, re-file their existing entries on it so backfilled rows
	// and new writes agree about what day they are on. Best effort: a failure here
	// leaves the rows as the backfill wrote them, which is the pre-existing state,
	// and must not fail the settings write the user actually asked for.
	if prev == "UTC" && s.Timezone != "UTC" {
		if loc, lerr := ParseLocation(s.Timezone); lerr == nil {
			if moved, rerr := h.s.User.RederiveLoggedOn(uid, loc); rerr != nil {
				log.Printf("rederive logged_on for uid=%d in %s: %v", uid, s.Timezone, rerr)
			} else if moved > 0 {
				log.Printf("rederived logged_on for uid=%d in %s: %d rows", uid, s.Timezone, moved)
			}
		}
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

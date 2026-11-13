package controllers

import (
	"database/sql"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

var validate = utils.NewValidator()

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
		utils.Fail(c, utils.CodeRegistrationClosed, nil)
		return
	}

	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	// Before hashing: bcrypt refuses anything over 72 bytes outright, and mapping that
	// to a 500 told the user the server had broken on input their password manager
	// generates by default.
	if utils.PasswordTooLong(req.Password) {
		utils.Fail(c, utils.CodePasswordTooLong, nil)
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
		utils.Fail(c, utils.CodeRegistrationClosed, nil)
		return
	}
	if errors.Is(err, stores.ErrEmailTaken) || utils.IsUniqueViolation(err) {
		utils.Fail(c, utils.CodeEmailTaken, nil)
		return
	}
	if utils.DBError(c, err) {
		return
	}

	// A brand new row is at token_version 1 by schema default.
	access, refresh, err := h.mintSession(userID, req.Email, 1)
	if err != nil {
		utils.InternalError(c)
		return
	}

	// Read the row back rather than assembling the response by hand. Building it from
	// the request left created_at/updated_at at Go's zero time, which serialises as
	// "0001-01-01T00:00:00Z" — and the clients render that, so a new account's Settings
	// page showed "Member since December 1" until something refetched /me.
	user, err := h.s.User.GetMe(userID)
	if err != nil {
		// The account exists and the tokens are valid; only the echoed profile is
		// missing. Fall back rather than fail the registration.
		user = models.User{ID: userID, Email: req.Email}
	}
	utils.Created(c, models.AuthResponse{Token: access, RefreshToken: refresh, User: user})
}

func (h *Handler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	// Keyed on the address as typed, folded the way sign-in folds it, and spent before the
	// lookup so an address that does not exist is limited exactly like one that does.
	// A successful login gives its tokens back, so only failures are counted. The demo
	// account's password is published and every visitor shares it, so it is exempt here
	// (the per-address limit on the route still applies).
	email := strings.ToLower(strings.TrimSpace(req.Email))
	pair := c.ClientIP() + "|" + email
	if !(config.C.DemoMode && config.IsDemoEmail(email)) {
		if ok, wait := h.loginByPair.Allow(pair); !ok {
			middleware.Reject(c, wait)
			return
		}
		if ok, wait := h.loginByEmail.Allow(email); !ok {
			h.loginByPair.Refund(pair)
			middleware.Reject(c, wait)
			return
		}
	}

	user, err := h.s.User.GetByEmail(req.Email)
	if err == sql.ErrNoRows {
		// Pay the bcrypt round a real account would have cost. Returning straight away
		// made a missing address answer ~12x faster than a wrong password, which tells
		// anyone asking exactly which addresses are registered — undoing the point of
		// giving both cases the same message.
		utils.BurnPasswordComparison(req.Password)
		utils.Fail(c, utils.CodeInvalidCredentials, nil)
		return
	}
	if utils.DBError(c, err) {
		return
	}
	if !utils.CheckPassword(req.Password, user.Password) {
		utils.Fail(c, utils.CodeInvalidCredentials, nil)
		return
	}

	h.loginByPair.Refund(pair)
	h.loginByEmail.Refund(email)

	access, refresh, err := h.mintSession(user.ID, user.Email, user.TokenVersion)
	if err != nil {
		utils.InternalError(c)
		return
	}

	user.Password = ""
	utils.OK(c, models.AuthResponse{Token: access, RefreshToken: refresh, User: user})
}

// refuseDemo answers 403 when the account is the seeded demo user on an instance that
// seeds it. Its password is published, so letting a visitor change it, move its address or
// delete it would let one of them lock everyone else out of the demo.
func refuseDemo(c *gin.Context, user models.User) bool {
	if config.C.DemoMode && config.IsDemoEmail(user.Email) {
		utils.Fail(c, utils.CodeDemoAccountProtected, nil)
		return true
	}
	return false
}

// reauthenticate loads the caller and checks their current password, writing the 401
// itself on failure.
func (h *Handler) reauthenticate(c *gin.Context, password string) (models.User, bool) {
	// Looked up by ID, not by the email in the token: an address that changed since the
	// token was minted would otherwise resolve to the wrong row or to none at all.
	user, err := h.s.User.GetByID(middleware.UserID(c))
	if err == sql.ErrNoRows {
		utils.Fail(c, utils.CodeAccountNotFound, nil)
		return models.User{}, false
	}
	if utils.DBError(c, err) {
		return models.User{}, false
	}

	// Before the password is checked, because the demo password is public: a correct one
	// must not be what opens the door. Every account-changing route comes through here.
	if refuseDemo(c, user) {
		return models.User{}, false
	}
	if !utils.CheckPassword(password, user.Password) {
		utils.Fail(c, utils.CodeWrongCurrentPassword, nil)
		return models.User{}, false
	}
	return user, true
}

// ChangePassword sets a new password for the signed-in caller and ends every other
// session. The device that made the change gets a fresh token pair in the response, so
// it stays signed in while the rest fall off as their access tokens lapse.
func (h *Handler) ChangePassword(c *gin.Context) {
	uid := middleware.UserID(c)

	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	user, ok := h.reauthenticate(c, req.CurrentPassword)
	if !ok {
		return
	}
	// Rejected before hashing. Allowing it would burn a bcrypt round to no effect and,
	// worse, still bump token_version — signing every other device out for a change
	// that never happened.
	if req.CurrentPassword == req.NewPassword {
		utils.Fail(c, utils.CodePasswordUnchanged, nil)
		return
	}

	if utils.PasswordTooLong(req.NewPassword) {
		utils.Fail(c, utils.CodePasswordTooLong, nil)
		return
	}

	newHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		utils.InternalError(c)
		return
	}

	version, err := h.s.User.ChangePassword(uid, user.Password, newHash)
	if errors.Is(err, stores.ErrPasswordChanged) {
		utils.Fail(c, utils.CodePasswordChangedElsewhere, nil)
		return
	}
	if utils.DBError(c, err) {
		return
	}

	access, refresh, err := h.mintSession(uid, user.Email, version)
	if err != nil {
		// The password did change — reporting a failure here would send the user off to
		// retry with a password that no longer works. Say what happened instead.
		utils.Fail(c, utils.CodePasswordChangedSignIn, nil)
		return
	}

	utils.OK(c, gin.H{"token": access, "refresh_token": refresh})
}

// ChangeEmail moves the signed-in caller to a new address and ends every other session,
// as ChangePassword does: with no confirmation mail to the old address, revoking the other
// sessions is the only containment if someone else's session made the change. The device
// that made it gets a fresh token pair in the response and stays signed in. The password
// is checked before the conflict lookup so a wrong password can never learn whether an
// address is registered. Re-submitting the current spelling is a no-op that ends nothing,
// and changing only its letter case is allowed and ends nothing either: the sign-in identity
// is the same, so there is nothing to contain.
func (h *Handler) ChangeEmail(c *gin.Context) {
	var req models.ChangeEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	user, ok := h.reauthenticate(c, req.CurrentPassword)
	if !ok {
		return
	}
	if req.Email == user.Email {
		h.respondWithSession(c, user)
		return
	}

	updated, err := h.s.User.ChangeEmail(user.ID, user.Password, req.Email)
	if errors.Is(err, stores.ErrEmailTaken) || utils.IsUniqueViolation(err) {
		utils.Fail(c, utils.CodeEmailTaken, nil)
		return
	}
	if errors.Is(err, stores.ErrPasswordChanged) {
		utils.Fail(c, utils.CodePasswordChangedElsewhere, nil)
		return
	}
	if utils.DBError(c, err) {
		return
	}
	h.respondWithSession(c, updated)
}

// respondWithSession answers with the login-shaped body: a token pair minted at the user's
// current token version, plus the user. The email change already took effect by the time
// this runs, so a minting failure says what happened rather than reporting a failure that
// would send the user off to retry.
func (h *Handler) respondWithSession(c *gin.Context, user models.User) {
	access, refresh, err := h.mintSession(user.ID, user.Email, user.TokenVersion)
	if err != nil {
		utils.Fail(c, utils.CodeEmailChangedSignIn, nil)
		return
	}
	utils.OK(c, models.AuthResponse{Token: access, RefreshToken: refresh, User: user})
}

// mintSession mints a token pair whose refresh half is recorded server-side, which is what
// lets it be rotated, revoked and recognised if replayed.
func (h *Handler) mintSession(uid int64, email string, version int) (access, refresh string, err error) {
	t, err := utils.GenerateSession(uid, email, version)
	if err != nil {
		return "", "", err
	}
	if err := h.s.Refresh.Issue(t.RefreshID, uid, time.Now(), t.RefreshExpires); err != nil {
		return "", "", err
	}
	return t.Access, t.Refresh, nil
}

// Logout revokes the refresh token it is given, so a copy of it stops working at once
// instead of living out its 30 days. It is public on purpose: the access token is often
// expired by the time someone signs out, and the refresh token is the credential being
// retired. It answers 200 for a token that is invalid, already revoked or never tracked, so
// it is idempotent and tells a prober nothing. Access tokens already issued still run out
// their own hour; there is no list to put them on.
func (h *Handler) Logout(c *gin.Context) {
	var req models.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}
	if claims, err := utils.ValidateToken(req.RefreshToken); err == nil && claims.Type == "refresh" && claims.ID != "" {
		if utils.DBError(c, h.s.Refresh.Revoke(claims.ID, claims.UserID, time.Now())) {
			return
		}
	}
	utils.OK(c, gin.H{"logged_out": true})
}

func (h *Handler) RefreshToken(c *gin.Context) {
	var req models.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BindError(c, err)
		return
	}

	claims, err := utils.ValidateToken(req.RefreshToken)
	if err != nil || claims.Type != "refresh" {
		utils.Fail(c, utils.CodeSessionInvalid, nil)
		return
	}

	// Signature validity says the token was minted by us; it cannot say the credentials
	// behind it still stand. A refresh lives 30 days, so without this check a password change
	// would leave every other device — including whoever the change was meant to evict — able
	// to mint fresh access tokens for a month. The auth middleware makes the same comparison
	// for access tokens on every request, so a revoked device stops at its next request.
	current, err := h.s.User.TokenVersion(claims.UserID)
	if err == sql.ErrNoRows {
		utils.Fail(c, utils.CodeSessionInvalid, nil)
		return
	}
	if utils.DBError(c, err) {
		return
	}
	if utils.NormalizeTokenVersion(claims.TokenVersion) != current {
		utils.Fail(c, utils.CodeSessionExpired, nil)
		return
	}

	// A token without a jti predates the table and is served on token_version alone; the
	// pair it earns below is tracked, so each device leaves the untracked shape on its
	// first refresh. A token with one is spent exactly once.
	if claims.ID != "" {
		result, err := h.s.Refresh.Rotate(claims.ID, claims.UserID, time.Now(), utils.RefreshGrace)
		if utils.DBError(c, err) {
			return
		}
		switch result {
		case stores.RotateRevoked, stores.RotateUnknown:
			utils.Fail(c, utils.CodeSessionInvalid, nil)
			return
		case stores.RotateReuse:
			// A token that was already rotated away is being presented long after the
			// fact. Whoever holds it, the server cannot say which of two parties is the
			// owner, so it ends every session and the owner signs in again.
			if utils.DBError(c, h.s.User.BumpTokenVersion(claims.UserID)) {
				return
			}
			log.Printf("auth: refresh token reuse for user %d; sessions revoked", claims.UserID)
			utils.Fail(c, utils.CodeSessionExpired, nil)
			return
		}
	}

	access, refresh, err := h.mintSession(claims.UserID, claims.Email, current)
	if err != nil {
		utils.InternalError(c)
		return
	}

	utils.OK(c, gin.H{"token": access, "refresh_token": refresh})
}

package middleware

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

// TokenVersions is what Auth needs from the user store: the account's current token
// generation, or sql.ErrNoRows when the account is gone.
type TokenVersions interface {
	TokenVersion(uid int64) (int, error)
}

const UserIDKey = "user_id"
const UserEmailKey = "user_email"

// Auth accepts a request only if its access token is genuine and still stands: the account
// exists and the token was minted against the account's current token version. A signature
// alone proves we issued the token, not that the credentials behind it survive, so without
// the lookup a deleted account or a session ended by a password or email change kept working
// until its token expired — reads came back empty and writes failed with a server error.
//
// One primary-key read per request, measured at about 10µs on the production pool. A
// mismatch answers 401, which the clients already read as "try a refresh"; the refresh
// then fails the same check and signs the device out cleanly.
func Auth(versions TokenVersions) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			utils.Unauthorized(c, "You need to sign in to do that.")
			c.Abort()
			return
		}

		claims, err := utils.ValidateToken(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			utils.Unauthorized(c, "Your session isn't valid. Please sign in again.")
			c.Abort()
			return
		}

		if claims.Type != "access" {
			utils.Unauthorized(c, "That token can't be used here.")
			c.Abort()
			return
		}

		current, err := versions.TokenVersion(claims.UserID)
		if errors.Is(err, sql.ErrNoRows) {
			utils.Unauthorized(c, "Your session isn't valid. Please sign in again.")
			c.Abort()
			return
		}
		if utils.DBError(c, err) {
			c.Abort()
			return
		}
		if utils.NormalizeTokenVersion(claims.TokenVersion) != current {
			utils.Unauthorized(c, "Your session expired. Please sign in again.")
			c.Abort()
			return
		}

		c.Set(UserIDKey, claims.UserID)
		c.Set(UserEmailKey, claims.Email)
		c.Next()
	}
}

func UserID(c *gin.Context) int64 {
	id, _ := c.Get(UserIDKey)
	v, _ := id.(int64)
	return v
}

package middleware

import (
	"strings"

	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

const UserIDKey = "user_id"
const UserEmailKey = "user_email"

func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			utils.Unauthorized(c, "missing or invalid authorization header")
			c.Abort()
			return
		}

		claims, err := utils.ValidateToken(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			utils.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}

		if claims.Type != "access" {
			utils.Unauthorized(c, "invalid token type")
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

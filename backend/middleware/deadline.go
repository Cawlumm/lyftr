package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// NoWriteDeadline lifts the server's WriteTimeout for one route whose handler legitimately
// runs long (the admin catalog sync answers only when it is done). Where the writer cannot
// change its deadline the error is ignored: the route then simply keeps the server default.
func NoWriteDeadline() gin.HandlerFunc {
	return func(c *gin.Context) {
		_ = http.NewResponseController(c.Writer).SetWriteDeadline(time.Time{})
		c.Next()
	}
}

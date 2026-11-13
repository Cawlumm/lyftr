package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// DefaultMaxBody bounds a request body for every route not listed in overrides. Every JSON
// payload this API accepts is a few KB; the largest legitimate one, a program or workout
// with hundreds of sets, is well under this.
const DefaultMaxBody int64 = 1 << 20

// MaxBody caps how much of a request body a handler can read. A body over the cap makes the
// read fail, which the handlers' bind step already reports as a 4xx; the connection is not
// left streaming into memory. Routes are matched by their registered pattern (FullPath),
// so overrides is keyed "METHOD /api/v1/path/:id".
func MaxBody(def int64, overrides map[string]int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := def
		if n, ok := overrides[c.Request.Method+" "+c.FullPath()]; ok {
			limit = n
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Next()
	}
}

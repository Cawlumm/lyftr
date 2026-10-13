package middleware

import "github.com/gin-gonic/gin"

// LocaleSyncer fills the exercise cache for a language. SyncLocale must return
// without waiting and must treat English and unknown tags as no-ops.
type LocaleSyncer interface{ SyncLocale(locale string) }

// SyncExerciseLocale asks for the exercise cache to be filled in the language a
// request names, before the handler runs. It is the one place that does so, applied
// to the route groups whose responses carry exercise names, so no handler has to
// remember: a new endpoint that returns exercises joins the group and is covered.
//
// The groups are the exercise-bearing half of LOCALIZED_PATH in
// packages/shared/src/client.ts, which decides which requests carry a locale at all.
func SyncExerciseLocale(s LocaleSyncer) gin.HandlerFunc {
	return func(c *gin.Context) {
		if locale := c.Query("locale"); locale != "" {
			s.SyncLocale(locale)
		}
		c.Next()
	}
}

package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

type recordingSyncer struct{ locales []string }

func (r *recordingSyncer) SyncLocale(l string) { r.locales = append(r.locales, l) }

func TestSyncExerciseLocale(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name, url string
		want      []string
	}{
		{"names a language", "/exercises?locale=es", []string{"es"}},
		{"regional tag passes through for the store to normalise", "/exercises?locale=pt-BR", []string{"pt-BR"}},
		{"no locale", "/exercises", nil},
		{"empty locale", "/exercises?locale=", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := &recordingSyncer{}
			r := gin.New()
			r.GET("/exercises", SyncExerciseLocale(rec), func(c *gin.Context) { c.Status(http.StatusNoContent) })

			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, tc.url, nil))

			if w.Code != http.StatusNoContent {
				t.Fatalf("status = %d: the handler must still run", w.Code)
			}
			if len(rec.locales) != len(tc.want) || (len(tc.want) > 0 && rec.locales[0] != tc.want[0]) {
				t.Errorf("synced %v, want %v", rec.locales, tc.want)
			}
		})
	}
}

package routes

import (
	"bytes"
	"database/sql"
	"fmt"
	"image"
	"image/jpeg"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/controllers"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
)

// The thumbnail route through the real router: reachable with no token (an <img> sends
// none), cacheable forever when it works, and never cached when oedb fails.
func TestExerciseThumbRoute(t *testing.T) {
	const id = "48fe6ee6-f6e4-4d8b-9be5-a235eb8ca7e5"
	prev := config.C
	config.C = &config.Config{
		Env: "production", CORSOrigin: "http://a.com", Registration: config.RegistrationOpen,
		JWTSecret: "test-secret-test-secret-test-secret-1", JWTExpiry: "3600", Version: "test",
	}
	t.Cleanup(func() { config.C = prev })

	conn, err := sql.Open("sqlite", fmt.Sprintf("file:thumbs_%d?mode=memory&cache=shared&_pragma=foreign_keys(on)", rand.Int63()))
	if err != nil {
		t.Fatal(err)
	}
	prevDB := db.DB
	db.DB = conn
	if err := db.BuildSchema(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(); db.DB = prevDB })
	if _, err := conn.Exec(`INSERT INTO exercises (name, muscle_group, category, image_url) VALUES ('Row', 'back', 'strength', ?)`,
		"http://oedb.example/api/v1/images/"+id); err != nil {
		t.Fatal(err)
	}

	var src bytes.Buffer
	if err := jpeg.Encode(&src, image.NewGray(image.Rect(0, 0, 600, 400)), nil); err != nil {
		t.Fatal(err)
	}
	up := http.StatusOK
	oedb := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(up)
		if up == http.StatusOK {
			w.Write(src.Bytes())
		}
	}))
	t.Cleanup(oedb.Close)

	s := stores.New(conn)
	s.Thumbs = stores.NewThumbStore(conn, t.TempDir(), oedb.URL)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	Setup(r, controllers.NewHandler(s))
	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w
	}

	up = http.StatusServiceUnavailable
	w := get("/api/v1/media/exercise-thumbs/" + id)
	if w.Code != http.StatusBadGateway || w.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("oedb down: %d %q, want 502 no-store", w.Code, w.Header().Get("Cache-Control"))
	}

	up = http.StatusOK
	w = get("/api/v1/media/exercise-thumbs/" + id)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d, want 200 without a token", w.Code)
	}
	if got := w.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Errorf("Cache-Control %q", got)
	}
	if got := w.Header().Get("Content-Type"); got != "image/jpeg" {
		t.Errorf("Content-Type %q", got)
	}

	if w := get("/api/v1/media/exercise-thumbs/00000000-0000-0000-0000-000000000000"); w.Code != http.StatusNotFound {
		t.Errorf("unknown id: %d, want 404", w.Code)
	}
}

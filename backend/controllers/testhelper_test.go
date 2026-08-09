package controllers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
)

// th is the DI handler under test, rebuilt per test in setupTestDB so it binds
// the fresh per-test db.DB.
var th *Handler

func setupTestDB(t *testing.T) {
	t.Helper()
	var err error
	// modernc ignores the mattn-style _foreign_keys=on; use the _pragma form so the
	// harness actually enforces foreign keys, matching the production DSN.
	dbName := fmt.Sprintf("file:testdb_%d?mode=memory&cache=shared&_pragma=foreign_keys(on)", rand.Int63())
	db.DB, err = sql.Open("sqlite", dbName)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err = db.DB.Ping(); err != nil {
		t.Fatalf("ping test db: %v", err)
	}
	if err = applySchema(); err != nil {
		t.Fatalf("apply schema: %v", err)
	}
	th = NewHandler(stores.New(db.DB))
	t.Cleanup(func() { db.DB.Close() })
}

func applySchema() error {
	// The real migrations, not a copy of them — see db.BuildSchema.
	return db.BuildSchema()
}

func createTestUser(t *testing.T) int64 {
	t.Helper()
	res, err := db.DB.Exec(
		`INSERT INTO users (email, password_hash) VALUES (?, ?)`,
		"test@example.com", "hashed",
	)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func createTestExercise(t *testing.T) int64 {
	t.Helper()
	res, err := db.DB.Exec(
		`INSERT INTO exercises (name, muscle_group, category) VALUES (?, ?, ?)`,
		"Test Exercise", "chest", "strength",
	)
	if err != nil {
		t.Fatalf("create test exercise: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func newContext(userID int64, method, path string, body any) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	var bodyBytes []byte
	if body != nil {
		bodyBytes, _ = json.Marshal(body)
	}
	c.Request, _ = http.NewRequest(method, path, bytes.NewBuffer(bodyBytes))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", userID)
	return c, w
}

func setParam(c *gin.Context, key, val string) {
	c.Params = gin.Params{{Key: key, Value: val}}
}

func decodeResponse(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var result map[string]any
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return result
}

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
	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) {
	t.Helper()
	var err error
	dbName := fmt.Sprintf("file:testdb_%d?mode=memory&cache=shared&_foreign_keys=on", rand.Int63())
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
	t.Cleanup(func() { db.DB.Close() })
}

func applySchema() error {
	schema := `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL DEFAULT '',
  secondary_muscles TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT 'strength',
  equipment TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS workout_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  order_index INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL DEFAULT 1,
  reps INTEGER NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 0,
  distance REAL NOT NULL DEFAULT 0,
  rpe REAL NOT NULL DEFAULT 0,
  is_warmup INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS program_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  order_index INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS program_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_exercise_id INTEGER NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL DEFAULT 1,
  target_reps INTEGER NOT NULL DEFAULT 0,
  target_weight REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS weight_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);`
	_, err := db.DB.Exec(schema)
	return err
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

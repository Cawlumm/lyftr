package controllers

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
)

// seedWorkoutWithSet creates a workout → workout_exercise → set for a given user/exercise.
func seedWorkoutWithSet(t *testing.T, userID, exID int64, weight float64, reps int, isWarmup int) {
	t.Helper()
	var wID int64
	row := db.DB.QueryRow(
		`INSERT INTO workouts (user_id, name, duration, started_at) VALUES (?, 'Test Workout', 3600, CURRENT_TIMESTAMP) RETURNING id`,
		userID,
	)
	if err := row.Scan(&wID); err != nil {
		t.Fatalf("insert workout: %v", err)
	}
	var weID int64
	row = db.DB.QueryRow(
		`INSERT INTO workout_exercises (workout_id, exercise_id, order_index) VALUES (?, ?, 0) RETURNING id`,
		wID, exID,
	)
	if err := row.Scan(&weID); err != nil {
		t.Fatalf("insert workout_exercise: %v", err)
	}
	_, err := db.DB.Exec(
		`INSERT INTO sets (workout_exercise_id, set_number, reps, weight, is_warmup) VALUES (?, 1, ?, ?, ?)`,
		weID, reps, weight, isWarmup,
	)
	if err != nil {
		t.Fatalf("insert set: %v", err)
	}
}

func TestGetExercisePRs_noHistory(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	c, w := newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/exercises/%d/prs", exID), nil)
	setParam(c, "id", fmt.Sprintf("%d", exID))
	GetExercisePRs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	if resp["data"] != nil {
		t.Fatalf("expected nil data for exercise with no history, got %v", resp["data"])
	}
}

func TestGetExercisePRs_returnsBestSet(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	seedWorkoutWithSet(t, uid, exID, 100.0, 5, 0)
	seedWorkoutWithSet(t, uid, exID, 120.0, 3, 0) // heavier — should be PR
	seedWorkoutWithSet(t, uid, exID, 80.0, 10, 0)

	c, w := newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/exercises/%d/prs", exID), nil)
	setParam(c, "id", fmt.Sprintf("%d", exID))
	GetExercisePRs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data, ok := resp["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected data object, got %T: %v", resp["data"], resp["data"])
	}
	if data["weight"].(float64) != 120.0 {
		t.Fatalf("expected PR weight 120, got %v", data["weight"])
	}
	if data["reps"].(float64) != 3 {
		t.Fatalf("expected PR reps 3, got %v", data["reps"])
	}
	if data["estimated_1rm"] == nil {
		t.Fatal("expected estimated_1rm in response")
	}
}

func TestGetExercisePRs_ignoresWarmup(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	seedWorkoutWithSet(t, uid, exID, 200.0, 1, 1) // warmup — should be excluded
	seedWorkoutWithSet(t, uid, exID, 100.0, 5, 0)

	c, w := newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/exercises/%d/prs", exID), nil)
	setParam(c, "id", fmt.Sprintf("%d", exID))
	GetExercisePRs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["weight"].(float64) != 100.0 {
		t.Fatalf("expected PR weight 100 (warmup excluded), got %v", data["weight"])
	}
}

func TestGetExercisePRs_isolatesUser(t *testing.T) {
	setupTestDB(t)
	uid1 := createTestUser(t)
	uid2, err := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('other@example.com', 'x')`)
	if err != nil {
		t.Fatal(err)
	}
	other, _ := uid2.LastInsertId()
	exID := createTestExercise(t)

	seedWorkoutWithSet(t, int64(other), exID, 200.0, 5, 0) // other user's PR
	seedWorkoutWithSet(t, uid1, exID, 100.0, 5, 0)

	c, w := newContext(uid1, http.MethodGet, fmt.Sprintf("/api/v1/exercises/%d/prs", exID), nil)
	setParam(c, "id", fmt.Sprintf("%d", exID))
	GetExercisePRs(c)

	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["weight"].(float64) != 100.0 {
		t.Fatalf("expected user1 PR 100, got %v (should not see other user data)", data["weight"])
	}
}

func TestGetExercisePRs_invalidID(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/exercises/bad/prs", nil)
	setParam(c, "id", "bad")
	GetExercisePRs(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestGetExerciseHistory_empty(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	c, w := newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/exercises/%d/history", exID), nil)
	setParam(c, "id", fmt.Sprintf("%d", exID))
	GetExerciseHistory(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data, ok := resp["data"].([]any)
	if !ok {
		t.Fatalf("expected data array, got %T", resp["data"])
	}
	if len(data) != 0 {
		t.Fatalf("expected empty history, got %d items", len(data))
	}
}

func TestGetExerciseHistory_returnsSessionsGrouped(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	seedWorkoutWithSet(t, uid, exID, 100.0, 8, 0)
	seedWorkoutWithSet(t, uid, exID, 110.0, 6, 0)
	seedWorkoutWithSet(t, uid, exID, 120.0, 4, 0)

	c, w := newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/exercises/%d/history", exID), nil)
	setParam(c, "id", fmt.Sprintf("%d", exID))
	GetExerciseHistory(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data, ok := resp["data"].([]any)
	if !ok {
		t.Fatalf("expected data array, got %T", resp["data"])
	}
	if len(data) != 3 {
		t.Fatalf("expected 3 sessions, got %d", len(data))
	}
	first := data[0].(map[string]any)
	if first["max_weight"] == nil || first["total_volume"] == nil || first["sets_count"] == nil {
		t.Fatalf("missing fields in history point: %v", first)
	}
}

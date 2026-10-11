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
	th.GetExercisePRs(c)

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
	th.GetExercisePRs(c)

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
	th.GetExercisePRs(c)

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
	th.GetExercisePRs(c)

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
	th.GetExercisePRs(c)

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
	th.GetExerciseHistory(c)

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
	th.GetExerciseHistory(c)

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

// seedSpanishSquat is an English base row with a Spanish translation, a workout
// that logged it, and returns the workout id and the exercise id.
func seedSpanishSquat(t *testing.T, uid int64) (workoutID, exerciseID int64) {
	t.Helper()
	res, err := db.DB.Exec(`INSERT INTO exercises (name, muscle_group, category) VALUES ('Squat', 'legs', 'strength')`)
	if err != nil {
		t.Fatalf("insert exercise: %v", err)
	}
	exerciseID, _ = res.LastInsertId()
	if _, err := db.DB.Exec(
		`INSERT INTO exercise_translations (exercise_id, locale, name) VALUES (?, 'es', 'Sentadilla')`, exerciseID,
	); err != nil {
		t.Fatalf("insert translation: %v", err)
	}
	seedWorkoutWithSet(t, uid, exerciseID, 100, 5, 0)
	if err := db.DB.QueryRow(`SELECT id FROM workouts WHERE user_id = ?`, uid).Scan(&workoutID); err != nil {
		t.Fatalf("find workout: %v", err)
	}
	return workoutID, exerciseID
}

func TestLocaleQueryParam(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	wid, exID := seedSpanishSquat(t, uid)

	workoutExerciseName := func(query string) (int, string) {
		c, w := newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/workouts/%d%s", wid, query), nil)
		setParam(c, "id", fmt.Sprintf("%d", wid))
		th.GetWorkout(c)
		if w.Code != http.StatusOK {
			return w.Code, ""
		}
		data := decodeResponse(t, w)["data"].(map[string]any)
		ex := data["exercises"].([]any)[0].(map[string]any)["exercise"].(map[string]any)
		return w.Code, ex["name"].(string)
	}

	for query, want := range map[string]string{
		"?locale=es":    "Sentadilla",
		"?locale=es-MX": "Sentadilla",
		"":              "Squat",
		"?locale=fr":    "Squat",
		"?locale=!!":    "Squat",
		"?locale=":      "Squat",
	} {
		code, got := workoutExerciseName(query)
		if code != http.StatusOK || got != want {
			t.Errorf("GET workout%s = %d %q, want 200 %q", query, code, got, want)
		}
	}

	c, w := newContext(uid, http.MethodGet, "/api/v1/exercises?q=sentadilla&locale=es", nil)
	th.ListExercises(c)
	list := decodeResponse(t, w)["data"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["name"] != "Sentadilla" {
		t.Errorf("localized search = %v, want the one Spanish row", list)
	}

	c, w = newContext(uid, http.MethodGet, "/api/v1/exercises?q=sentadilla", nil)
	th.ListExercises(c)
	if list := decodeResponse(t, w)["data"].([]any); len(list) != 0 {
		t.Errorf("English search for a Spanish name = %v, want nothing", list)
	}

	c, w = newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/exercises/%d?locale=es", exID), nil)
	setParam(c, "id", fmt.Sprintf("%d", exID))
	th.GetExercise(c)
	if got := decodeResponse(t, w)["data"].(map[string]any)["name"]; got != "Sentadilla" {
		t.Errorf("GetExercise?locale=es name = %v", got)
	}
	c, w = newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/exercises/%d?locale=xx!!", exID), nil)
	setParam(c, "id", fmt.Sprintf("%d", exID))
	th.GetExercise(c)
	if w.Code != http.StatusOK || decodeResponse(t, w)["data"].(map[string]any)["name"] != "Squat" {
		t.Errorf("GetExercise?locale=xx!! = %d %s, want 200 English", w.Code, w.Body.String())
	}
}

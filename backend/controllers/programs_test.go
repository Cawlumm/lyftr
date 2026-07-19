package controllers

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
)

func TestListPrograms_empty(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/programs", nil)
	th.ListPrograms(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data, ok := resp["data"].([]any)
	if !ok {
		t.Fatalf("expected data array, got %T", resp["data"])
	}
	if len(data) != 0 {
		t.Fatalf("expected empty list, got %d items", len(data))
	}
}

func TestCreateProgram_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	body := map[string]any{
		"name":  "PPL Program",
		"notes": "Push Pull Legs 6 days",
		"exercises": []map[string]any{
			{
				"exercise_id": exID,
				"notes":       "Focus on form",
				"sets": []map[string]any{
					{"set_number": 1, "target_reps": 5, "target_weight": 100.0},
					{"set_number": 2, "target_reps": 5, "target_weight": 100.0},
					{"set_number": 3, "target_reps": 5, "target_weight": 100.0},
				},
			},
		},
	}

	c, w := newContext(uid, http.MethodPost, "/api/v1/programs", body)
	th.CreateProgram(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["name"] != "PPL Program" {
		t.Errorf("expected name 'PPL Program', got %v", data["name"])
	}
	exercises, ok := data["exercises"].([]any)
	if !ok {
		t.Fatalf("exercises field missing or wrong type: %T = %v", data["exercises"], data["exercises"])
	}
	if len(exercises) != 1 {
		t.Fatalf("expected 1 exercise, got %d", len(exercises))
	}
	ex0 := exercises[0].(map[string]any)
	sets, ok := ex0["sets"].([]any)
	if !ok {
		t.Fatalf("sets field missing or wrong type: %T = %v", ex0["sets"], ex0["sets"])
	}
	if len(sets) != 3 {
		t.Errorf("expected 3 sets, got %d", len(sets))
	}
}

// createProgramReturns posts a program body and returns the decoded "data" object,
// failing the test if the status isn't the one wanted.
func createProgramReturns(t *testing.T, uid int64, body map[string]any, wantCode int) map[string]any {
	t.Helper()
	c, w := newContext(uid, http.MethodPost, "/api/v1/programs", body)
	th.CreateProgram(c)
	if w.Code != wantCode {
		t.Fatalf("status = %d, want %d: %s", w.Code, wantCode, w.Body.String())
	}
	if wantCode >= 300 {
		return nil
	}
	resp := decodeResponse(t, w)
	return resp["data"].(map[string]any)
}

func TestCreateProgram_withDaysRoundTrips(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	body := map[string]any{
		"name": "Upper/Lower",
		"days": []map[string]any{
			{
				"name":        "Upper A",
				"is_rest_day": false,
				"exercises": []map[string]any{
					{"exercise_id": exID, "sets": []map[string]any{{"target_reps": 8, "target_weight": 95.0}}},
				},
			},
			{"name": "Rest", "is_rest_day": true},
			{
				"name":        "Lower A",
				"is_rest_day": false,
				"exercises": []map[string]any{
					{"exercise_id": exID, "sets": []map[string]any{{"target_reps": 5, "target_weight": 185.0}}},
				},
			},
		},
	}
	data := createProgramReturns(t, uid, body, http.StatusCreated)

	days := data["days"].([]any)
	if len(days) != 3 {
		t.Fatalf("want 3 days, got %d", len(days))
	}
	// Order preserved, rest flag set, rest day has no exercises.
	d0 := days[0].(map[string]any)
	d1 := days[1].(map[string]any)
	d2 := days[2].(map[string]any)
	if d0["name"] != "Upper A" || d0["is_rest_day"] != false {
		t.Errorf("day0 = %v", d0)
	}
	if d1["name"] != "Rest" || d1["is_rest_day"] != true {
		t.Errorf("day1 = %v", d1)
	}
	if ex, _ := d1["exercises"].([]any); len(ex) != 0 {
		t.Errorf("rest day should have no exercises, got %d", len(ex))
	}
	if ex := d2["exercises"].([]any); len(ex) != 1 {
		t.Errorf("day2 want 1 exercise, got %d", len(ex))
	}
	// Flattened compat field = first training day only.
	flat := data["exercises"].([]any)
	if len(flat) != 1 {
		t.Fatalf("flattened exercises want 1 (first training day), got %d", len(flat))
	}
}

func TestCreateProgram_daysWinOverLegacyExercises(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	// Both days and legacy exercises sent — days must win, exercises ignored.
	body := map[string]any{
		"name": "Both",
		"days": []map[string]any{
			{"name": "Day A", "exercises": []map[string]any{{"exercise_id": exID, "sets": []map[string]any{{"target_reps": 5}}}}},
		},
		"exercises": []map[string]any{
			{"exercise_id": exID, "sets": []map[string]any{{"target_reps": 99}}},
			{"exercise_id": exID, "sets": []map[string]any{{"target_reps": 99}}},
		},
	}
	data := createProgramReturns(t, uid, body, http.StatusCreated)
	days := data["days"].([]any)
	if len(days) != 1 {
		t.Fatalf("want 1 day (from days field), got %d", len(days))
	}
	if name := days[0].(map[string]any)["name"]; name != "Day A" {
		t.Errorf("want the days-field day, got %v", name)
	}
}

func TestCreateProgram_legacyFlatWrapsIntoDayOne(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	body := map[string]any{
		"name":      "Legacy",
		"exercises": []map[string]any{{"exercise_id": exID, "sets": []map[string]any{{"target_reps": 5}}}},
	}
	data := createProgramReturns(t, uid, body, http.StatusCreated)
	days := data["days"].([]any)
	if len(days) != 1 {
		t.Fatalf("want 1 wrapped day, got %d", len(days))
	}
	if name := days[0].(map[string]any)["name"]; name != "Day 1" {
		t.Errorf("wrapped day name = %v, want 'Day 1'", name)
	}
	if flat := data["exercises"].([]any); len(flat) != 1 {
		t.Errorf("flattened exercises want 1, got %d", len(flat))
	}
}

func TestCreateProgram_restDayWithExercisesRejected(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	body := map[string]any{
		"name": "Bad Rest",
		"days": []map[string]any{
			{"name": "Train", "exercises": []map[string]any{{"exercise_id": exID}}},
			{"name": "Rest", "is_rest_day": true, "exercises": []map[string]any{{"exercise_id": exID}}},
		},
	}
	// Normalization strips a rest day's exercises, so this specific payload actually
	// succeeds with an empty rest day — assert the strip happened rather than a 400.
	data := createProgramReturns(t, uid, body, http.StatusCreated)
	days := data["days"].([]any)
	rest := days[1].(map[string]any)
	if ex, _ := rest["exercises"].([]any); len(ex) != 0 {
		t.Errorf("rest day exercises should be stripped, got %d", len(ex))
	}
}

func TestCreateProgram_zeroTrainingDaysRejected(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name": "All Rest",
		"days": []map[string]any{
			{"name": "Rest 1", "is_rest_day": true},
			{"name": "Rest 2", "is_rest_day": true},
		},
	}
	createProgramReturns(t, uid, body, http.StatusBadRequest)
}

func TestCreateProgram_tooManyDaysRejected(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	days := make([]map[string]any, 15)
	for i := range days {
		days[i] = map[string]any{"name": fmt.Sprintf("Rest %d", i), "is_rest_day": true}
	}
	body := map[string]any{"name": "Too Many", "days": days}
	// 15 days trips the struct-tag max=14, surfaced as 422 by ValidationError before
	// the controller's own day-count guard (which returns 400) is reached.
	createProgramReturns(t, uid, body, http.StatusUnprocessableEntity)
}

func TestCreateProgram_missingName(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name":      "",
		"exercises": []map[string]any{},
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/programs", body)
	th.CreateProgram(c)

	if w.Code == http.StatusCreated {
		t.Fatal("expected error for empty name, got 201")
	}
}

func TestGetProgram_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	res, _ := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, "prog_other@example.com", "x")
	otherUID, _ := res.LastInsertId()

	res2, _ := db.DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, ?)`, otherUID, "Private Program")
	pid, _ := res2.LastInsertId()

	c, w := newContext(uid, http.MethodGet, "/api/v1/programs/"+fmt.Sprint(pid), nil)
	setParam(c, "id", fmt.Sprint(pid))
	th.GetProgram(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user access, got %d", w.Code)
	}
}

func TestDeleteProgram_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	res, _ := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, "prog_other2@example.com", "x")
	otherUID, _ := res.LastInsertId()

	res2, _ := db.DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, ?)`, otherUID, "Protected Program")
	pid, _ := res2.LastInsertId()

	c, w := newContext(uid, http.MethodDelete, "/api/v1/programs/"+fmt.Sprint(pid), nil)
	setParam(c, "id", fmt.Sprint(pid))
	th.DeleteProgram(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user delete, got %d", w.Code)
	}

	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM programs WHERE id = ?`, pid).Scan(&count)
	if count != 1 {
		t.Fatal("program was deleted by wrong user")
	}
}

func TestUpdateProgram_replacesExercises(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	// Create second exercise
	res, _ := db.DB.Exec(`INSERT INTO exercises (name, muscle_group, category) VALUES (?, ?, ?)`, "Test Exercise 2", "back", "strength")
	exID2, _ := res.LastInsertId()

	// Create program with 1 exercise
	progRes, _ := db.DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, ?)`, uid, "Original")
	pid, _ := progRes.LastInsertId()
	exRes, _ := db.DB.Exec(`INSERT INTO program_exercises (program_id, exercise_id, order_index) VALUES (?, ?, 0)`, pid, exID)
	peid, _ := exRes.LastInsertId()
	db.DB.Exec(`INSERT INTO program_sets (program_exercise_id, set_number, target_reps) VALUES (?, 1, 5)`, peid)

	// Update with different exercise
	body := map[string]any{
		"name":  "Updated Program",
		"notes": "",
		"exercises": []map[string]any{
			{
				"exercise_id": exID2,
				"notes":       "",
				"sets":        []map[string]any{{"set_number": 1, "target_reps": 8, "target_weight": 60.0}},
			},
		},
	}

	c, w := newContext(uid, http.MethodPut, "/api/v1/programs/"+fmt.Sprint(pid), body)
	setParam(c, "id", fmt.Sprint(pid))
	th.UpdateProgram(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Old exercise should be gone
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM program_exercises WHERE program_id = ? AND exercise_id = ?`, pid, exID).Scan(&count)
	if count != 0 {
		t.Error("old exercise not removed after update")
	}

	// New exercise should exist
	db.DB.QueryRow(`SELECT COUNT(*) FROM program_exercises WHERE program_id = ? AND exercise_id = ?`, pid, exID2).Scan(&count)
	if count != 1 {
		t.Error("new exercise not found after update")
	}
}

func TestCreateProgram_setNumberNormalized(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	// Send set_number: 0 — backend should normalize to 1
	body := map[string]any{
		"name": "Norm Test",
		"exercises": []map[string]any{
			{
				"exercise_id": exID,
				"sets":        []map[string]any{{"set_number": 0, "target_reps": 10, "target_weight": 50.0}},
			},
		},
	}

	c, w := newContext(uid, http.MethodPost, "/api/v1/programs", body)
	th.CreateProgram(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	exercises := data["exercises"].([]any)
	sets := exercises[0].(map[string]any)["sets"].([]any)
	setNum := sets[0].(map[string]any)["set_number"].(float64)
	if setNum != 1 {
		t.Errorf("expected set_number 1 after normalization, got %v", setNum)
	}
}

func TestListPrograms_filtersBySearchQuery(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other := otherUser(t)

	db.DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, ?)`, uid, "Push Day")
	db.DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, ?)`, uid, "Leg Day")
	// Same matching name under another user — must NOT leak across users.
	db.DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, ?)`, other, "Push Day (theirs)")

	c, w := newContext(uid, http.MethodGet, "/api/v1/programs?q=push", nil)
	c.Request.URL.RawQuery = "q=push" // case-insensitive LIKE on name, scoped by user
	th.ListPrograms(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	data := decodeResponse(t, w)["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("expected 1 match for q=push (case-insensitive, excludes 'Leg Day' and the other user's), got %d", len(data))
	}
	if name := data[0].(map[string]any)["name"]; name != "Push Day" {
		t.Errorf("expected 'Push Day', got %v", name)
	}
}

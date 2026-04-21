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
	ListPrograms(c)

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
	CreateProgram(c)

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

func TestCreateProgram_missingName(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name":      "",
		"exercises": []map[string]any{},
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/programs", body)
	CreateProgram(c)

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
	GetProgram(c)

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
	DeleteProgram(c)

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
	UpdateProgram(c)

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
	CreateProgram(c)

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

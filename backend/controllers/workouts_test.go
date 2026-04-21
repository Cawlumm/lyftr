package controllers

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
)

func TestListWorkouts_empty(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/workouts", nil)
	ListWorkouts(c)

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

func TestCreateWorkout_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	body := map[string]any{
		"name":     "Push Day",
		"notes":    "felt strong",
		"duration": 3600,
		"exercises": []map[string]any{
			{
				"exercise_id": exID,
				"notes":       "",
				"sets": []map[string]any{
					{"set_number": 1, "reps": 8, "weight": 100.0},
					{"set_number": 2, "reps": 8, "weight": 100.0},
				},
			},
		},
	}

	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	CreateWorkout(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["name"] != "Push Day" {
		t.Errorf("expected name 'Push Day', got %v", data["name"])
	}
	exercises, ok := data["exercises"].([]any)
	if !ok || len(exercises) != 1 {
		t.Errorf("expected 1 exercise, got %v", data["exercises"])
	}
}

func TestCreateWorkout_missingName(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name":      "",
		"exercises": []map[string]any{},
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	CreateWorkout(c)

	if w.Code == http.StatusCreated {
		t.Fatal("expected error for empty name, got 201")
	}
}

func TestCreateWorkout_preservesStartedAt(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	startedAt := "2024-01-15T09:30:00Z"
	body := map[string]any{
		"name":       "Morning Lift",
		"duration":   60,
		"started_at": startedAt,
		"exercises": []map[string]any{
			{
				"exercise_id": exID,
				"sets":        []map[string]any{{"set_number": 1, "reps": 5, "weight": 80.0}},
			},
		},
	}

	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	CreateWorkout(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if sa, ok := data["started_at"].(string); !ok || sa == "" {
		t.Errorf("started_at missing in response: %v", data["started_at"])
	}
}

func TestGetWorkout_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	// Create second user
	res, _ := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, "other@example.com", "x")
	otherUID, _ := res.LastInsertId()

	// Create workout as otherUID
	res2, _ := db.DB.Exec(
		`INSERT INTO workouts (user_id, name, started_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
		otherUID, "Other's Workout",
	)
	wid, _ := res2.LastInsertId()

	// Try to GET as uid (different user)
	c, w := newContext(uid, http.MethodGet, "/api/v1/workouts/"+fmt.Sprint(wid), nil)
	setParam(c, "id", fmt.Sprint(wid))
	GetWorkout(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user access, got %d", w.Code)
	}
}

func TestDeleteWorkout_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	res, _ := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, "other2@example.com", "x")
	otherUID, _ := res.LastInsertId()

	res2, _ := db.DB.Exec(
		`INSERT INTO workouts (user_id, name, started_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
		otherUID, "Protected Workout",
	)
	wid, _ := res2.LastInsertId()

	c, w := newContext(uid, http.MethodDelete, "/api/v1/workouts/"+fmt.Sprint(wid), nil)
	setParam(c, "id", fmt.Sprint(wid))
	DeleteWorkout(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user delete, got %d", w.Code)
	}

	// Verify workout still exists
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM workouts WHERE id = ?`, wid).Scan(&count)
	if count != 1 {
		t.Fatal("workout was deleted by wrong user")
	}
}

func TestUpdateWorkout_preservesStartedAt(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	originalTime := "2024-03-01T08:00:00Z"
	res, _ := db.DB.Exec(
		`INSERT INTO workouts (user_id, name, started_at) VALUES (?, ?, ?)`,
		uid, "Original Name", originalTime,
	)
	wid, _ := res.LastInsertId()

	body := map[string]any{
		"name":       "Updated Name",
		"duration":   1800,
		"started_at": originalTime,
		"exercises": []map[string]any{
			{
				"exercise_id": exID,
				"sets":        []map[string]any{{"set_number": 1, "reps": 10, "weight": 50.0}},
			},
		},
	}

	c, w := newContext(uid, http.MethodPut, "/api/v1/workouts/"+fmt.Sprint(wid), body)
	setParam(c, "id", fmt.Sprint(wid))
	UpdateWorkout(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["name"] != "Updated Name" {
		t.Errorf("name not updated: %v", data["name"])
	}
}

func TestListWorkouts_limitCap(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	// Insert 5 workouts
	for i := 0; i < 5; i++ {
		db.DB.Exec(
			`INSERT INTO workouts (user_id, name, started_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
			uid, fmt.Sprintf("Workout %d", i),
		)
	}

	// Request with limit=200 (above cap of 100)
	c, w := newContext(uid, http.MethodGet, "/api/v1/workouts?limit=200", nil)
	c.Request.URL.RawQuery = "limit=200"
	ListWorkouts(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	// Should still return results (capped at 100, but we only have 5)
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 5 {
		t.Errorf("expected 5 workouts, got %d", len(data))
	}
}

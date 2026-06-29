package controllers

import (
	"net/http"
	"testing"
)

// TestGetMe_deletedAccountReturns401 covers the review fix: GetMe used to fall
// through utils.DBError (which ignores sql.ErrNoRows) and return 200 with an
// empty user for a deleted-but-still-authenticated account. It must now 401.
func TestGetMe_deletedAccountReturns401(t *testing.T) {
	setupTestDB(t)
	// No user row with this id exists — account deleted, JWT still valid.
	c, w := newContext(99999, http.MethodGet, "/api/v1/me", nil)
	th.GetMe(c)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing user, got %d (%s)", w.Code, w.Body.String())
	}
}

// TestCreateWorkout_unknownExerciseReturns400 covers the review fix: with foreign
// keys now enforced, a workout referencing a non-existent exercise must surface as
// a clean 400, not a 500 (FK violation) or a silent dangling insert.
func TestCreateWorkout_unknownExerciseReturns400(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	body := map[string]any{
		"name": "Test Workout",
		"exercises": []map[string]any{
			{"exercise_id": 99999, "sets": []map[string]any{{"reps": 5, "weight": 100}}},
		},
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown exercise_id, got %d (%s)", w.Code, w.Body.String())
	}
}

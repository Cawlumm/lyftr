package controllers

import (
	"net/http"
	"testing"
)

// Per-exercise rest_seconds (#33) must persist through create + the re-read load.
func TestWorkoutRestSecondsRoundTrips(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	body := map[string]any{
		"name": "Rest RT",
		"exercises": []map[string]any{
			{"exercise_id": exID, "rest_seconds": 120, "sets": []map[string]any{{"reps": 5, "weight": 100}}},
		},
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("create workout: %d (%s)", w.Code, w.Body.String())
	}
	exs := decodeResponse(t, w)["data"].(map[string]any)["exercises"].([]any)
	if rest := exs[0].(map[string]any)["rest_seconds"].(float64); rest != 120 {
		t.Errorf("workout exercise rest_seconds = %v, want 120", rest)
	}
}

func TestProgramRestSecondsRoundTrips(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	body := map[string]any{
		"name": "Rest RT",
		"days": []map[string]any{
			{
				"is_rest_day": false,
				"exercises": []map[string]any{
					{"exercise_id": exID, "rest_seconds": 0, "sets": []map[string]any{{"target_reps": 5, "target_weight": 100}}},
				},
			},
		},
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/programs", body)
	th.CreateProgram(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("create program: %d (%s)", w.Code, w.Body.String())
	}
	// 0 = "off" must round-trip as 0, not get defaulted away.
	days := decodeResponse(t, w)["data"].(map[string]any)["days"].([]any)
	exs := days[0].(map[string]any)["exercises"].([]any)
	if rest := exs[0].(map[string]any)["rest_seconds"].(float64); rest != 0 {
		t.Errorf("program exercise rest_seconds = %v, want 0", rest)
	}
}

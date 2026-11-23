package controllers

import (
	"net/http"
	"strings"
	"testing"
)

func TestCreateExercise_InstructionLimits(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	many := make([]string, 31)
	for i := range many {
		many[i] = "step"
	}
	thirty := many[:30]
	// 30 steps of 100 chars join to well over 2000 characters.
	long := make([]string, 30)
	for i := range long {
		long[i] = strings.Repeat("x", 100)
	}

	cases := []struct {
		name     string
		steps    []string
		wantCode string
	}{
		{"31 steps", many, "INSTRUCTIONS_TOO_MANY"},
		{"301 char step", []string{strings.Repeat("x", 301)}, "INSTRUCTION_TOO_LONG"},
		{"control char", []string{"a\x07b"}, "INSTRUCTION_CONTROL_CHARS"},
		{"newline in a step", []string{"a\nb"}, "INSTRUCTION_CONTROL_CHARS"},
		{"joined over 2000", long, "INSTRUCTIONS_TEXT_TOO_LONG"},
		{"30 steps ok", thirty, ""},
		{"300 char step ok", []string{strings.Repeat("é", 300)}, ""},
		{"blank steps do not count", append([]string{"", "  "}, thirty...), ""},
	}
	for i, c := range cases {
		code, resp := createCustom(t, uid, map[string]any{
			"name": "Lift " + string(rune('A'+i)), "muscle_group": "chest", "instructions": c.steps,
		})
		if c.wantCode == "" {
			if code != http.StatusCreated {
				t.Errorf("%s: %d %v", c.name, code, resp)
			}
			continue
		}
		if code != http.StatusUnprocessableEntity || resp["code"] != c.wantCode {
			t.Errorf("%s: %d %v, want 422 %s", c.name, code, resp, c.wantCode)
		}
	}
}

func TestCreateExercise_InstructionsRoundTrip(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	code, resp := createCustom(t, uid, map[string]any{"name": "New app", "muscle_group": "chest", "instructions": []string{"A", "B"}})
	d, _ := resp["data"].(map[string]any)
	if code != http.StatusCreated || d["description"] != "A\nB" {
		t.Fatalf("%d %v", code, resp)
	}
	if got := d["instructions"].([]any); len(got) != 2 || got[0] != "A" {
		t.Errorf("instructions = %v", got)
	}

	code, resp = createCustom(t, uid, map[string]any{"name": "Old app", "muscle_group": "chest", "description": "1. A\n2. B"})
	d, _ = resp["data"].(map[string]any)
	if code != http.StatusCreated || len(d["instructions"].([]any)) != 2 {
		t.Fatalf("%d %v", code, resp)
	}

	code, resp = createCustom(t, uid, map[string]any{"name": "None", "muscle_group": "chest"})
	d, _ = resp["data"].(map[string]any)
	if got, ok := d["instructions"].([]any); code != http.StatusCreated || !ok || len(got) != 0 {
		t.Errorf("no steps: %d instructions = %#v, want []", code, d["instructions"])
	}
}

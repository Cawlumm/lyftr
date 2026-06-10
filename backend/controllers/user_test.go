package controllers

import (
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
)

func seedSettings(t *testing.T, uid int64) {
	t.Helper()
	if _, err := db.DB.Exec(
		`INSERT INTO user_settings (user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target)
		 VALUES (?, 'kg', 2500, 180, 300, 80)`, uid,
	); err != nil {
		t.Fatalf("seed settings: %v", err)
	}
}

func TestUpdateSettingsPartialPayloadPreservesOtherFields(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	seedSettings(t, uid)

	c, w := newContext(uid, "PUT", "/settings", map[string]any{"calorie_target": 1800})
	UpdateSettings(c)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)

	if got := data["calorie_target"].(float64); got != 1800 {
		t.Errorf("calorie_target = %v, want 1800", got)
	}
	if got := data["weight_unit"].(string); got != "kg" {
		t.Errorf("weight_unit = %q, want kg (must not be reset by partial update)", got)
	}
	if got := data["protein_target"].(float64); got != 180 {
		t.Errorf("protein_target = %v, want 180 (must not be zeroed by partial update)", got)
	}
	if got := data["carb_target"].(float64); got != 300 {
		t.Errorf("carb_target = %v, want 300 (must not be zeroed by partial update)", got)
	}
	if got := data["fat_target"].(float64); got != 80 {
		t.Errorf("fat_target = %v, want 80 (must not be zeroed by partial update)", got)
	}
}

func TestUpdateSettingsRejectsInvalidWeightUnit(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	seedSettings(t, uid)

	c, w := newContext(uid, "PUT", "/settings", map[string]any{"weight_unit": "stone"})
	UpdateSettings(c)

	if w.Code != 422 {
		t.Fatalf("expected 422 for invalid weight_unit, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateSettingsCreatesRowWithDefaults(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, "PUT", "/settings", map[string]any{"protein_target": 200})
	UpdateSettings(c)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)

	if got := data["protein_target"].(float64); got != 200 {
		t.Errorf("protein_target = %v, want 200", got)
	}
	if got := data["calorie_target"].(float64); got != 2000 {
		t.Errorf("calorie_target = %v, want default 2000", got)
	}
	if got := data["weight_unit"].(string); got != "lbs" {
		t.Errorf("weight_unit = %q, want default lbs", got)
	}
}

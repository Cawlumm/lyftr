package controllers

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
)

func insertWeightLog(t *testing.T, uid int64, weight float64, loggedAt time.Time) int64 {
	t.Helper()
	res, err := db.DB.Exec(
		`INSERT INTO weight_logs (user_id, weight, notes, logged_at) VALUES (?, ?, '', ?)`,
		uid, weight, loggedAt,
	)
	if err != nil {
		t.Fatalf("insert weight log: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestListWeightLogs_empty(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight", nil)
	ListWeightLogs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data, ok := resp["data"].([]any)
	if !ok || len(data) != 0 {
		t.Fatalf("expected empty list, got %v", resp["data"])
	}
}

func TestListWeightLogs_orderedDescAndScopedByUser(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other, _ := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, "x@x.com", "x")
	otherUID, _ := other.LastInsertId()

	now := time.Now()
	insertWeightLog(t, uid, 180.0, now.AddDate(0, 0, -2))
	insertWeightLog(t, uid, 181.5, now.AddDate(0, 0, -1))
	insertWeightLog(t, uid, 179.0, now)
	insertWeightLog(t, otherUID, 999.0, now)

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight", nil)
	ListWeightLogs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 3 {
		t.Fatalf("expected 3 entries (own only), got %d", len(data))
	}
	first := data[0].(map[string]any)
	if first["weight"].(float64) != 179.0 {
		t.Errorf("expected newest first (179.0), got %v", first["weight"])
	}
}

func TestListWeightLogs_dateRange(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	now := time.Now()
	insertWeightLog(t, uid, 180.0, now.AddDate(0, 0, -10))
	insertWeightLog(t, uid, 181.0, now.AddDate(0, 0, -5))
	insertWeightLog(t, uid, 182.0, now)

	from := now.AddDate(0, 0, -7).Format("2006-01-02")
	to := now.Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/weight?from=%s&to=%s", from, to), nil)
	ListWeightLogs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 2 {
		t.Fatalf("expected 2 entries within range, got %d", len(data))
	}
}

func TestLogWeight_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{"weight": 185.5, "notes": "morning"}
	c, w := newContext(uid, http.MethodPost, "/api/v1/weight", body)
	LogWeight(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["weight"].(float64) != 185.5 {
		t.Errorf("expected weight 185.5, got %v", data["weight"])
	}
	if data["notes"].(string) != "morning" {
		t.Errorf("expected notes preserved, got %v", data["notes"])
	}
}

func TestLogWeight_rejectsNonPositive(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{"weight": 0}
	c, w := newContext(uid, http.MethodPost, "/api/v1/weight", body)
	LogWeight(c)

	if w.Code == http.StatusCreated {
		t.Fatal("expected validation error for weight=0, got 201")
	}
}

func TestLogWeight_rejectsImplausiblyLarge(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{"weight": 9999}
	c, w := newContext(uid, http.MethodPost, "/api/v1/weight", body)
	LogWeight(c)

	if w.Code == http.StatusCreated {
		t.Fatal("expected validation error for weight=9999, got 201")
	}
}

func TestUpdateWeightLog_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	id := insertWeightLog(t, uid, 180.0, time.Now())

	body := map[string]any{"weight": 178.0, "notes": "after run"}
	c, w := newContext(uid, http.MethodPatch, "/api/v1/weight/"+fmt.Sprint(id), body)
	setParam(c, "id", fmt.Sprint(id))
	UpdateWeightLog(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["weight"].(float64) != 178.0 {
		t.Errorf("expected updated weight 178.0, got %v", data["weight"])
	}
	if data["notes"].(string) != "after run" {
		t.Errorf("expected updated notes, got %v", data["notes"])
	}
}

func TestUpdateWeightLog_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other, _ := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, "y@y.com", "x")
	otherUID, _ := other.LastInsertId()
	id := insertWeightLog(t, otherUID, 200.0, time.Now())

	body := map[string]any{"weight": 100.0}
	c, w := newContext(uid, http.MethodPatch, "/api/v1/weight/"+fmt.Sprint(id), body)
	setParam(c, "id", fmt.Sprint(id))
	UpdateWeightLog(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user update, got %d", w.Code)
	}
	var weight float64
	db.DB.QueryRow(`SELECT weight FROM weight_logs WHERE id = ?`, id).Scan(&weight)
	if weight != 200.0 {
		t.Fatalf("expected unchanged weight 200.0, got %v", weight)
	}
}

func TestDeleteWeightLog_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other, _ := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, "z@z.com", "x")
	otherUID, _ := other.LastInsertId()
	id := insertWeightLog(t, otherUID, 200.0, time.Now())

	c, w := newContext(uid, http.MethodDelete, "/api/v1/weight/"+fmt.Sprint(id), nil)
	setParam(c, "id", fmt.Sprint(id))
	DeleteWeightLog(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user delete, got %d", w.Code)
	}
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM weight_logs WHERE id = ?`, id).Scan(&count)
	if count != 1 {
		t.Fatal("entry was deleted by wrong user")
	}
}

func TestGetWeightStats_richFields(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	now := time.Now()
	insertWeightLog(t, uid, 180.0, now.AddDate(0, 0, -40))
	insertWeightLog(t, uid, 178.0, now.AddDate(0, 0, -20))
	insertWeightLog(t, uid, 176.0, now.AddDate(0, 0, -5))
	insertWeightLog(t, uid, 175.0, now.AddDate(0, 0, -1))

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight/stats", nil)
	GetWeightStats(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)

	if data["latest"].(float64) != 175.0 {
		t.Errorf("latest: expected 175.0, got %v", data["latest"])
	}
	if data["starting"].(float64) != 180.0 {
		t.Errorf("starting: expected 180.0, got %v", data["starting"])
	}
	if data["min"].(float64) != 175.0 {
		t.Errorf("min: expected 175.0, got %v", data["min"])
	}
	if data["max"].(float64) != 180.0 {
		t.Errorf("max: expected 180.0, got %v", data["max"])
	}
	if data["total_entries"].(float64) != 4 {
		t.Errorf("total_entries: expected 4, got %v", data["total_entries"])
	}
	// 7d window contains entries at -5d and -1d, so change_7d = 175 - 176 = -1
	if got := data["change_7d"].(float64); got != -1.0 {
		t.Errorf("change_7d: expected -1.0, got %v", got)
	}
	// 30d window contains -20, -5, -1, so change_30d = 175 - 178 = -3
	if got := data["change_30d"].(float64); got != -3.0 {
		t.Errorf("change_30d: expected -3.0, got %v", got)
	}
}

func TestGetWeightStats_noData(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight/stats", nil)
	GetWeightStats(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["total_entries"].(float64) != 0 {
		t.Errorf("expected total_entries=0, got %v", data["total_entries"])
	}
	if data["change_7d"].(float64) != 0 {
		t.Errorf("expected change_7d=0 with no data, got %v", data["change_7d"])
	}
}

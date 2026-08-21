package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
)

// ─── helpers ──────────────────────────────────────────────────────────────────

func insertFoodLog(t *testing.T, uid int64, name, meal string, calories, protein, carbs, fat float64, loggedAt time.Time) int64 {
	t.Helper()
	res, err := db.DB.Exec(
		`INSERT INTO food_logs (user_id, name, meal, calories, protein, carbs, fat, fiber, servings, serving_size, barcode, image_url, logged_at, logged_on)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, '', '', '', ?, ?)`,
		uid, name, meal, calories, protein, carbs, fat,
		// Bound as time.Time, the way the stores do. Formatting to a string here
		// wrote a row shape production never creates, which hid exactly the class of
		// bug where a range comparison depends on the stored encoding.
		loggedAt,
		localDayFor(t, uid, loggedAt),
	)
	if err != nil {
		t.Fatalf("insertFoodLog: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

// localDayFor is the day a fixture row files itself under: the instant resolved in
// the user's stored zone, which is exactly what the handlers do for a client that
// sends no logged_on. Fixtures must derive it the same way production does — writing
// a day the app would never write is how a test ends up asserting a behaviour that
// does not exist.
func localDayFor(t *testing.T, uid int64, instant time.Time) string {
	t.Helper()
	var zone string
	if err := db.DB.QueryRow(`SELECT timezone FROM user_settings WHERE user_id = ?`, uid).Scan(&zone); err != nil {
		zone = "UTC" // no settings row is normal for a freshly created test user
	}
	loc, err := time.LoadLocation(zone)
	if err != nil {
		loc = time.UTC
	}
	return instant.In(loc).Format("2006-01-02")
}

func insertSavedFood(t *testing.T, uid int64, name string) int64 {
	t.Helper()
	res, err := db.DB.Exec(
		`INSERT INTO saved_foods (user_id, name, brand, calories, protein, carbs, fat, fiber, serving_size, barcode) VALUES (?, ?, '', 100, 10, 10, 5, 2, '1 serving', '')`,
		uid, name,
	)
	if err != nil {
		t.Fatalf("insertSavedFood: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func otherUser(t *testing.T) int64 {
	t.Helper()
	res, err := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, "other@example.com", "x")
	if err != nil {
		t.Fatalf("otherUser: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

// offMockTransport rewrites all requests to the given httptest.Server, so
// SearchFood and LookupBarcode hit a local handler instead of real OFF.
type offMockTransport struct{ server *httptest.Server }

func (tr *offMockTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r2 := r.Clone(r.Context())
	r2.URL.Scheme = "http"
	r2.URL.Host = strings.TrimPrefix(tr.server.URL, "http://")
	return http.DefaultTransport.RoundTrip(r2)
}

func withOFFMock(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	s := httptest.NewServer(handler)
	prev := offClient
	offClient = &http.Client{Transport: &offMockTransport{server: s}, Timeout: 5 * time.Second}
	t.Cleanup(func() {
		offClient = prev
		s.Close()
	})
	return s
}

// ─── ListFoodLogs ─────────────────────────────────────────────────────────────

func TestListFoodLogs_empty(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/food", nil)
	th.ListFoodLogs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 0 {
		t.Fatalf("expected empty list, got %d items", len(data))
	}
}

func TestListFoodLogs_scopedByDateAndUser(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other := otherUser(t)

	today := time.Now().UTC()
	yesterday := today.AddDate(0, 0, -1)

	insertFoodLog(t, uid, "Breakfast today", "breakfast", 400, 30, 50, 10, today)
	insertFoodLog(t, uid, "Lunch yesterday", "lunch", 600, 40, 60, 15, yesterday)
	insertFoodLog(t, other, "Other user today", "dinner", 500, 25, 55, 12, today)

	date := today.Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, "/api/v1/food?date="+date, nil)
	th.ListFoodLogs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("expected 1 entry for today (own only), got %d", len(data))
	}
	entry := data[0].(map[string]any)
	if entry["name"].(string) != "Breakfast today" {
		t.Errorf("unexpected entry name: %v", entry["name"])
	}
}

// ─── GetFoodLog ───────────────────────────────────────────────────────────────

func TestGetFoodLog_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	id := insertFoodLog(t, uid, "Chicken breast", "lunch", 300, 50, 5, 8, time.Now())

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/"+fmt.Sprint(id), nil)
	setParam(c, "id", fmt.Sprint(id))
	th.GetFoodLog(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["name"].(string) != "Chicken breast" {
		t.Errorf("unexpected name: %v", data["name"])
	}
}

func TestGetFoodLog_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other := otherUser(t)
	id := insertFoodLog(t, other, "Secret meal", "dinner", 800, 60, 80, 30, time.Now())

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/"+fmt.Sprint(id), nil)
	setParam(c, "id", fmt.Sprint(id))
	th.GetFoodLog(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user get, got %d", w.Code)
	}
}

func TestGetFoodLog_invalidID(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/abc", nil)
	setParam(c, "id", "abc")
	th.GetFoodLog(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid id, got %d", w.Code)
	}
}

// ─── LogFood ──────────────────────────────────────────────────────────────────

func TestLogFood_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name": "Oatmeal", "meal": "breakfast",
		"calories": 350.0, "protein": 12.0, "carbs": 60.0, "fat": 6.0,
		"fiber": 5.0, "servings": 1.0, "serving_size": "1 cup",
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/food", body)
	th.LogFood(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["name"].(string) != "Oatmeal" {
		t.Errorf("expected name Oatmeal, got %v", data["name"])
	}
	if data["calories"].(float64) != 350.0 {
		t.Errorf("expected calories 350, got %v", data["calories"])
	}
	if data["fiber"].(float64) != 5.0 {
		t.Errorf("expected fiber 5, got %v", data["fiber"])
	}
	if data["servings"].(float64) != 1.0 {
		t.Errorf("expected servings 1, got %v", data["servings"])
	}
}

func TestLogFood_defaultsServingsToOne(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name": "Apple", "meal": "snacks",
		"calories": 95.0, "protein": 0.5, "carbs": 25.0, "fat": 0.3,
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/food", body)
	th.LogFood(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["servings"].(float64) != 1.0 {
		t.Errorf("expected default servings=1, got %v", data["servings"])
	}
}

func TestLogFood_missingName(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{"meal": "breakfast", "calories": 300.0}
	c, w := newContext(uid, http.MethodPost, "/api/v1/food", body)
	th.LogFood(c)

	if w.Code == http.StatusCreated {
		t.Fatal("expected error for missing name, got 201")
	}
}

func TestLogFood_nameTooLong(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name": strings.Repeat("x", 201), "meal": "lunch",
		"calories": 100.0, "protein": 5.0, "carbs": 10.0, "fat": 3.0,
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/food", body)
	th.LogFood(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for name > 200 chars, got %d", w.Code)
	}
}

func TestLogFood_imageURLTooLong(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name": "Test", "meal": "lunch",
		"calories": 100.0, "protein": 5.0, "carbs": 10.0, "fat": 3.0,
		"image_url": "https://" + strings.Repeat("a", 494),
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/food", body)
	th.LogFood(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for image_url > 500 chars, got %d", w.Code)
	}
}

func TestLogFood_barcodeTooLong(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name": "Test", "meal": "dinner",
		"calories": 100.0, "protein": 5.0, "carbs": 10.0, "fat": 3.0,
		"barcode": strings.Repeat("1", 51),
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/food", body)
	th.LogFood(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for barcode > 50 chars, got %d", w.Code)
	}
}

// ─── UpdateFoodLog ────────────────────────────────────────────────────────────

func TestUpdateFoodLog_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	id := insertFoodLog(t, uid, "Old name", "breakfast", 300, 20, 40, 10, time.Now())

	body := map[string]any{
		"name": "New name", "meal": "lunch",
		"calories": 450.0, "protein": 35.0, "carbs": 55.0, "fat": 12.0,
	}
	c, w := newContext(uid, http.MethodPatch, "/api/v1/food/"+fmt.Sprint(id), body)
	setParam(c, "id", fmt.Sprint(id))
	th.UpdateFoodLog(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["name"].(string) != "New name" {
		t.Errorf("expected updated name, got %v", data["name"])
	}
	if data["calories"].(float64) != 450.0 {
		t.Errorf("expected updated calories 450, got %v", data["calories"])
	}
	if data["meal"].(string) != "lunch" {
		t.Errorf("expected updated meal lunch, got %v", data["meal"])
	}
}

func TestUpdateFoodLog_omittedLoggedAtDefaultsToNow(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	id := insertFoodLog(t, uid, "Old name", "breakfast", 300, 20, 40, 10, time.Now())

	body := map[string]any{
		"name": "New name", "meal": "lunch",
		"calories": 450.0, "protein": 35.0, "carbs": 55.0, "fat": 12.0,
	}
	c, w := newContext(uid, http.MethodPatch, "/api/v1/food/"+fmt.Sprint(id), body)
	setParam(c, "id", fmt.Sprint(id))
	th.UpdateFoodLog(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	loggedAt, err := time.Parse(time.RFC3339, data["logged_at"].(string))
	if err != nil {
		t.Fatalf("parse logged_at %v: %v", data["logged_at"], err)
	}
	if age := time.Since(loggedAt); age < 0 || age > time.Minute {
		t.Fatalf("expected omitted logged_at to default to now, got %v (%v old)", loggedAt, age)
	}
}

func TestUpdateFoodLog_suppliedLoggedAtStoredAsUTC(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	id := insertFoodLog(t, uid, "Old name", "breakfast", 300, 20, 40, 10, time.Now())

	body := map[string]any{
		"name": "New name", "meal": "lunch",
		"calories": 450.0, "protein": 35.0, "carbs": 55.0, "fat": 12.0,
		"logged_at": "2026-07-16T20:00:00-05:00",
	}
	c, w := newContext(uid, http.MethodPatch, "/api/v1/food/"+fmt.Sprint(id), body)
	setParam(c, "id", fmt.Sprint(id))
	th.UpdateFoodLog(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if got := data["logged_at"].(string); got != "2026-07-17T01:00:00Z" {
		t.Fatalf("expected logged_at stored as UTC, got %q", got)
	}
}

func TestUpdateFoodLog_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other := otherUser(t)
	id := insertFoodLog(t, other, "Original", "dinner", 500, 30, 60, 15, time.Now())

	body := map[string]any{
		"name": "Hijacked", "meal": "snacks",
		"calories": 100.0, "protein": 5.0, "carbs": 10.0, "fat": 3.0,
	}
	c, w := newContext(uid, http.MethodPatch, "/api/v1/food/"+fmt.Sprint(id), body)
	setParam(c, "id", fmt.Sprint(id))
	th.UpdateFoodLog(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user update, got %d", w.Code)
	}
	var name string
	db.DB.QueryRow(`SELECT name FROM food_logs WHERE id = ?`, id).Scan(&name)
	if name != "Original" {
		t.Fatal("entry was modified by wrong user")
	}
}

func TestUpdateFoodLog_notFound(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name": "x", "meal": "lunch",
		"calories": 100.0, "protein": 5.0, "carbs": 10.0, "fat": 3.0,
	}
	c, w := newContext(uid, http.MethodPatch, "/api/v1/food/9999", body)
	setParam(c, "id", "9999")
	th.UpdateFoodLog(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing entry, got %d", w.Code)
	}
}

// ─── DeleteFoodLog ────────────────────────────────────────────────────────────

func TestDeleteFoodLog_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	id := insertFoodLog(t, uid, "To delete", "snacks", 100, 5, 15, 3, time.Now())

	c, w := newContext(uid, http.MethodDelete, "/api/v1/food/"+fmt.Sprint(id), nil)
	setParam(c, "id", fmt.Sprint(id))
	th.DeleteFoodLog(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM food_logs WHERE id = ?`, id).Scan(&count)
	if count != 0 {
		t.Fatal("entry was not deleted")
	}
}

func TestDeleteFoodLog_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other := otherUser(t)
	id := insertFoodLog(t, other, "Protected", "breakfast", 400, 25, 50, 12, time.Now())

	c, w := newContext(uid, http.MethodDelete, "/api/v1/food/"+fmt.Sprint(id), nil)
	setParam(c, "id", fmt.Sprint(id))
	th.DeleteFoodLog(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user delete, got %d", w.Code)
	}
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM food_logs WHERE id = ?`, id).Scan(&count)
	if count != 1 {
		t.Fatal("entry was deleted by wrong user")
	}
}

// ─── GetDailyStats ────────────────────────────────────────────────────────────

func TestGetDailyStats_empty(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	date := time.Now().UTC().Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, "/api/v1/food/stats?date="+date, nil)
	th.GetDailyStats(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["total_calories"].(float64) != 0 {
		t.Errorf("expected 0 calories, got %v", data["total_calories"])
	}
}

func TestGetDailyStats_sumsMacrosCorrectly(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	today := time.Now().UTC()
	insertFoodLog(t, uid, "Breakfast", "breakfast", 500, 30, 60, 15, today)
	insertFoodLog(t, uid, "Lunch", "lunch", 700, 50, 80, 20, today)
	// Different date — must be excluded
	insertFoodLog(t, uid, "Yesterday", "dinner", 600, 40, 70, 18, today.AddDate(0, 0, -1))

	date := today.Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, "/api/v1/food/stats?date="+date, nil)
	th.GetDailyStats(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["total_calories"].(float64) != 1200 {
		t.Errorf("expected total_calories=1200, got %v", data["total_calories"])
	}
	if data["total_protein"].(float64) != 80 {
		t.Errorf("expected total_protein=80, got %v", data["total_protein"])
	}
	if data["total_carbs"].(float64) != 140 {
		t.Errorf("expected total_carbs=140, got %v", data["total_carbs"])
	}
	if data["total_fat"].(float64) != 35 {
		t.Errorf("expected total_fat=35, got %v", data["total_fat"])
	}
}

func TestGetDailyStats_scopedByUser(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other := otherUser(t)
	today := time.Now().UTC()

	insertFoodLog(t, uid, "Mine", "breakfast", 400, 25, 50, 10, today)
	insertFoodLog(t, other, "Theirs", "lunch", 9999, 999, 999, 999, today)

	date := today.Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, "/api/v1/food/stats?date="+date, nil)
	th.GetDailyStats(c)

	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["total_calories"].(float64) != 400 {
		t.Errorf("expected 400 kcal (own only), got %v", data["total_calories"])
	}
}

// ─── GetFoodHistory ───────────────────────────────────────────────────────────

func TestGetFoodHistory_empty(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/history?days=7", nil)
	th.GetFoodHistory(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 0 {
		t.Fatalf("expected empty history, got %d points", len(data))
	}
}

func TestGetFoodHistory_groupsByDay(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	now := time.Now().UTC()

	// Two entries on same day → should be one aggregated point
	insertFoodLog(t, uid, "A", "breakfast", 400, 20, 50, 10, now.AddDate(0, 0, -1))
	insertFoodLog(t, uid, "B", "lunch", 600, 40, 70, 15, now.AddDate(0, 0, -1))
	// Entry outside window → excluded
	insertFoodLog(t, uid, "Old", "dinner", 500, 30, 60, 12, now.AddDate(0, 0, -10))

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/history?days=7", nil)
	th.GetFoodHistory(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("expected 1 day point, got %d", len(data))
	}
	pt := data[0].(map[string]any)
	if pt["calories"].(float64) != 1000 {
		t.Errorf("expected aggregated calories=1000, got %v", pt["calories"])
	}
	if pt["protein"].(float64) != 60 {
		t.Errorf("expected aggregated protein=60, got %v", pt["protein"])
	}
}

func TestGetFoodHistory_defaultsDaysTo30(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	// Entry 20 days ago — should appear with no ?days param (default 30)
	insertFoodLog(t, uid, "Included", "lunch", 500, 30, 60, 15, time.Now().AddDate(0, 0, -20))

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/history", nil)
	th.GetFoodHistory(c)

	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("expected 1 point within default 30d window, got %d", len(data))
	}
}

// ─── offBrands.UnmarshalJSON ──────────────────────────────────────────────────

func TestOffBrands_stringInput(t *testing.T) {
	var b offBrands
	if err := json.Unmarshal([]byte(`"Kellogg's"`), &b); err != nil {
		t.Fatalf("unmarshal string brand: %v", err)
	}
	if len(b) != 1 || b[0] != "Kellogg's" {
		t.Errorf("expected [\"Kellogg's\"], got %v", b)
	}
}

func TestOffBrands_arrayInput(t *testing.T) {
	var b offBrands
	if err := json.Unmarshal([]byte(`["Jif","Smucker's"]`), &b); err != nil {
		t.Fatalf("unmarshal array brands: %v", err)
	}
	if len(b) != 2 {
		t.Errorf("expected 2 brands, got %v", b)
	}
}

func TestOffBrands_nullInput(t *testing.T) {
	var b offBrands
	if err := json.Unmarshal([]byte(`null`), &b); err != nil {
		t.Fatalf("unmarshal null: %v", err)
	}
	if len(b) != 0 {
		t.Errorf("expected empty brands for null, got %v", b)
	}
}

// ─── offProductToResult ───────────────────────────────────────────────────────

func TestOffProductToResult_usesServingWhenAvailable(t *testing.T) {
	p := offProduct{
		ProductName: "Jif Peanut Butter",
		Brands:      offBrands{"Jif"},
		ServingSize: "2 tbsp (32g)",
		Nutriments: offNutrients{
			EnergyKcal100g: 593, Proteins100g: 19, Carbohydrates100g: 22, Fat100g: 50,
			EnergyKcalServing: 190, ProteinsServing: 7, CarbohydratesServing: 7, FatServing: 16,
		},
		ImageURL: "https://images.openfoodfacts.org/jif.jpg",
	}
	r := offProductToResult(p)

	if r.Calories != 190 {
		t.Errorf("expected per-serving calories 190, got %v", r.Calories)
	}
	if r.ServingSize != "2 tbsp (32g)" {
		t.Errorf("expected serving size label, got %q", r.ServingSize)
	}
	if r.ImageURL != "https://images.openfoodfacts.org/jif.jpg" {
		t.Errorf("unexpected image url: %v", r.ImageURL)
	}
}

func TestOffProductToResult_fallsBackTo100g(t *testing.T) {
	p := offProduct{
		ProductName: "Generic Bread",
		Nutriments:  offNutrients{EnergyKcal100g: 265, Proteins100g: 9, Carbohydrates100g: 49, Fat100g: 3},
		// No serving_size, no _serving nutriments
	}
	r := offProductToResult(p)

	if r.Calories != 265 {
		t.Errorf("expected per-100g calories 265, got %v", r.Calories)
	}
	if r.ServingSize != "per 100g" {
		t.Errorf("expected 'per 100g' label, got %q", r.ServingSize)
	}
}

func TestOffProductToResult_rejectsNonHTTPSImageURL(t *testing.T) {
	p := offProduct{
		ProductName: "Test",
		ImageURL:    "http://example.com/img.jpg", // http, not https
	}
	r := offProductToResult(p)
	if r.ImageURL != "" {
		t.Errorf("expected empty image_url for non-https, got %q", r.ImageURL)
	}
}

func TestOffProductToResult_rejectsJavascriptImageURL(t *testing.T) {
	p := offProduct{
		ProductName: "Test",
		ImageURL:    "javascript:alert(1)",
	}
	r := offProductToResult(p)
	if r.ImageURL != "" {
		t.Errorf("expected empty image_url for javascript: URL, got %q", r.ImageURL)
	}
}

func TestOffProductToResult_joinsMultipleBrands(t *testing.T) {
	p := offProduct{
		ProductName: "Cola",
		Brands:      offBrands{"Coca-Cola", "TCCC"},
	}
	r := offProductToResult(p)
	if r.Brand != "Coca-Cola, TCCC" {
		t.Errorf("expected joined brands, got %q", r.Brand)
	}
}

// ─── LookupBarcode ────────────────────────────────────────────────────────────

func TestLookupBarcode_invalidFormat(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	for _, code := range []string{"abc", "123", "12345678901234567", "../etc"} {
		c, w := newContext(uid, http.MethodGet, "/api/v1/food/barcode/"+code, nil)
		setParam(c, "code", code)
		th.LookupBarcode(c)
		if w.Code != http.StatusBadRequest {
			t.Errorf("code %q: expected 400, got %d", code, w.Code)
		}
	}
}

func TestLookupBarcode_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	offResp := `{"status":"success","product":{"product_name":"Jif PB","brands":"Jif","serving_size":"2 tbsp","nutriments":{"energy-kcal_serving":190,"proteins_serving":7,"carbohydrates_serving":7,"fat_serving":16}}}`
	withOFFMock(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(offResp))
	})

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/barcode/051500255186", nil)
	setParam(c, "code", "051500255186")
	th.LookupBarcode(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["name"].(string) != "Jif PB" {
		t.Errorf("expected name 'Jif PB', got %v", data["name"])
	}
	if data["calories"].(float64) != 190 {
		t.Errorf("expected per-serving calories 190, got %v", data["calories"])
	}
}

func TestLookupBarcode_productNotFound(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	withOFFMock(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"failure","product":{}}`))
	})

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/barcode/012345678901", nil)
	setParam(c, "code", "012345678901")
	th.LookupBarcode(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown barcode, got %d", w.Code)
	}
}

func TestLookupBarcode_rateLimited(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	withOFFMock(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	})

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/barcode/012345678901", nil)
	setParam(c, "code", "012345678901")
	th.LookupBarcode(c)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 forwarded, got %d", w.Code)
	}
}

// ─── SearchFood ───────────────────────────────────────────────────────────────

func TestSearchFood_missingQuery(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/search", nil)
	th.SearchFood(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing q, got %d", w.Code)
	}
}

func TestSearchFood_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	offResp := `{"hits":[{"product_name":"Whole Milk","brands":"Organic Valley","serving_size":"1 cup","nutriments":{"energy-kcal_serving":150,"proteins_serving":8,"carbohydrates_serving":12,"fat_serving":8}},{"product_name":"","brands":"","nutriments":{}}]}`
	withOFFMock(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(offResp))
	})

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/search?q=milk", nil)
	th.SearchFood(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	// Product with empty name must be filtered out
	if len(data) != 1 {
		t.Fatalf("expected 1 result (empty product filtered), got %d", len(data))
	}
	item := data[0].(map[string]any)
	if item["name"].(string) != "Whole Milk" {
		t.Errorf("expected 'Whole Milk', got %v", item["name"])
	}
}

func TestSearchFood_rateLimited(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	withOFFMock(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	})

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/search?q=pizza", nil)
	th.SearchFood(c)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 forwarded, got %d", w.Code)
	}
}

func TestSearchFood_upstreamError(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	withOFFMock(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/search?q=pizza", nil)
	th.SearchFood(c)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for OFF 5xx, got %d", w.Code)
	}
}

// ─── ListSavedFoods ───────────────────────────────────────────────────────────

func TestListSavedFoods_empty(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/saved", nil)
	th.ListSavedFoods(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 0 {
		t.Fatalf("expected empty list, got %d items", len(data))
	}
}

func TestListSavedFoods_alphabeticalAndScopedByUser(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other := otherUser(t)

	insertSavedFood(t, uid, "Zucchini")
	insertSavedFood(t, uid, "Apple")
	insertSavedFood(t, uid, "Mango")
	insertSavedFood(t, other, "Should not appear")

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/saved", nil)
	th.ListSavedFoods(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 3 {
		t.Fatalf("expected 3 items (own only), got %d", len(data))
	}
	names := []string{
		data[0].(map[string]any)["name"].(string),
		data[1].(map[string]any)["name"].(string),
		data[2].(map[string]any)["name"].(string),
	}
	if names[0] != "Apple" || names[1] != "Mango" || names[2] != "Zucchini" {
		t.Errorf("expected alphabetical order, got %v", names)
	}
}

// ─── CreateSavedFood ──────────────────────────────────────────────────────────

func TestCreateSavedFood_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name": "Greek Yogurt", "brand": "Chobani",
		"calories": 130.0, "protein": 17.0, "carbs": 9.0, "fat": 3.5,
		"fiber": 0.0, "serving_size": "1 container (170g)",
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/food/saved", body)
	th.CreateSavedFood(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["name"].(string) != "Greek Yogurt" {
		t.Errorf("expected name 'Greek Yogurt', got %v", data["name"])
	}
	if data["brand"].(string) != "Chobani" {
		t.Errorf("expected brand 'Chobani', got %v", data["brand"])
	}
}

// Starring saves the unscaled food — the servings stepper scales at log time — so
// starring the same food twice cannot express anything the first star didn't. #115 was a
// user doing exactly that and being left with two identical rows he could not tell apart.
func TestCreateSavedFood_isSameStarTwice(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{
		"name": "Chicken Breast", "brand": "Tesco",
		"calories": 165.0, "protein": 31.0, "carbs": 0.0, "fat": 3.6,
		"fiber": 0.0, "serving_size": "100g",
	}

	c, w := newContext(uid, http.MethodPost, "/api/v1/food/saved", body)
	th.CreateSavedFood(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("first save: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	firstID := decodeResponse(t, w)["data"].(map[string]any)["id"]

	// Second save of the same food: 200, not 201 — nothing was created.
	c2, w2 := newContext(uid, http.MethodPost, "/api/v1/food/saved", body)
	th.CreateSavedFood(c2)
	if w2.Code != http.StatusOK {
		t.Fatalf("second save: expected 200, got %d: %s", w2.Code, w2.Body.String())
	}
	if got := decodeResponse(t, w2)["data"].(map[string]any)["id"]; got != firstID {
		t.Errorf("second save returned id %v, want the existing row %v", got, firstID)
	}

	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE user_id = ?`, uid).Scan(&count)
	if count != 1 {
		t.Fatalf("expected 1 saved food after saving the same one twice, got %d", count)
	}
}

// Same name, different brand, is a different product and stays a separate favourite.
func TestCreateSavedFood_brandDistinguishes(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	for _, brand := range []string{"Tesco", "Sainsbury's"} {
		body := map[string]any{
			"name": "Chicken Breast", "brand": brand,
			"calories": 165.0, "protein": 31.0, "carbs": 0.0, "fat": 3.6,
		}
		c, w := newContext(uid, http.MethodPost, "/api/v1/food/saved", body)
		th.CreateSavedFood(c)
		if w.Code != http.StatusCreated {
			t.Fatalf("brand %q: expected 201, got %d: %s", brand, w.Code, w.Body.String())
		}
	}

	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE user_id = ?`, uid).Scan(&count)
	if count != 2 {
		t.Fatalf("expected 2 saved foods across two brands, got %d", count)
	}
}

// The uniqueness is per user. One person starring a food must not stop anyone else.
func TestCreateSavedFood_scopedPerUser(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other := otherUser(t)

	body := map[string]any{"name": "Oats", "brand": "Quaker", "calories": 389.0}

	c, w := newContext(uid, http.MethodPost, "/api/v1/food/saved", body)
	th.CreateSavedFood(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("first user: expected 201, got %d", w.Code)
	}
	c2, w2 := newContext(other, http.MethodPost, "/api/v1/food/saved", body)
	th.CreateSavedFood(c2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("second user: expected 201, got %d: %s", w2.Code, w2.Body.String())
	}
}

func TestCreateSavedFood_missingName(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{"calories": 100.0, "protein": 5.0, "carbs": 10.0, "fat": 3.0}
	c, w := newContext(uid, http.MethodPost, "/api/v1/food/saved", body)
	th.CreateSavedFood(c)

	if w.Code == http.StatusCreated {
		t.Fatal("expected error for missing name, got 201")
	}
}

// ─── DeleteSavedFood ──────────────────────────────────────────────────────────

func TestDeleteSavedFood_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	id := insertSavedFood(t, uid, "To delete")

	c, w := newContext(uid, http.MethodDelete, "/api/v1/food/saved/"+fmt.Sprint(id), nil)
	setParam(c, "id", fmt.Sprint(id))
	th.DeleteSavedFood(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE id = ?`, id).Scan(&count)
	if count != 0 {
		t.Fatal("saved food was not deleted")
	}
}

func TestDeleteSavedFood_ownershipEnforced(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	other := otherUser(t)
	id := insertSavedFood(t, other, "Protected food")

	c, w := newContext(uid, http.MethodDelete, "/api/v1/food/saved/"+fmt.Sprint(id), nil)
	setParam(c, "id", fmt.Sprint(id))
	th.DeleteSavedFood(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user delete, got %d", w.Code)
	}
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE id = ?`, id).Scan(&count)
	if count != 1 {
		t.Fatal("saved food was deleted by wrong user")
	}
}

// insertFoodLogAt is the common case of insertFoodLog: a dinner entry with only
// calories set. One insert path, so a change to the row shape can't leave a second
// fixture stale.
func insertFoodLogAt(t *testing.T, uid int64, name string, calories float64, loggedAt time.Time) int64 {
	t.Helper()
	return insertFoodLog(t, uid, name, "dinner", calories, 0, 0, 0, loggedAt)
}

// A west-of-UTC user's late-evening entry belongs to their day, not the UTC day.
// Originally written against an explicit from/to range; the range is gone, so this
// now asserts the same user-visible outcome through the stored zone — which is the
// only path a client actually takes.
func TestListFoodLogs_localDayWestTimezone(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "America/Los_Angeles") // UTC-7 in April

	// 03:00 UTC on the 25th is 20:00 on the 24th in Los Angeles.
	c, w := newContext(uid, http.MethodPost, "/api/v1/food", map[string]any{
		"name": "Late dinner", "meal": "dinner", "calories": 800,
		"logged_at": "2026-04-25T03:00:00Z",
	})
	th.LogFood(c)
	// 08:00 UTC on the 25th is 01:00 on the 25th — the next local day.
	// The recorder is checked, not discarded: if this seed fails the "excluded from
	// the local day" assertion below passes for the wrong reason — the entry was
	// never there to leak in.
	c2, w2 := newContext(uid, http.MethodPost, "/api/v1/food", map[string]any{
		"name": "Next local day", "meal": "snacks", "calories": 500,
		"logged_at": "2026-04-25T08:00:00Z",
	})
	th.LogFood(c2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("seed the next-local-day entry: %d %s", w2.Code, w2.Body.String())
	}

	c, w = newContext(uid, http.MethodGet, "/api/v1/food?date=2026-04-24", nil)
	th.ListFoodLogs(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	data := decodeResponse(t, w)["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("expected 1 entry on the local day, got %d", len(data))
	}
	if name := data[0].(map[string]any)["name"].(string); name != "Late dinner" {
		t.Errorf("expected the local-evening entry, got %v", name)
	}
}

// Macros come from the stored day; the workout count still resolves through the
// zone, because a workout is an instant with no day of its own. Both halves of the
// payload must describe the same date.
func TestGetDailyStats_localDayWestTimezone(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "America/Los_Angeles")

	c, w := newContext(uid, http.MethodPost, "/api/v1/food", map[string]any{
		"name": "Late dinner", "meal": "dinner", "calories": 800,
		"logged_at": "2026-04-25T03:00:00Z",
	})
	th.LogFood(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("seed the local-evening entry: %d %s", w.Code, w.Body.String())
	}
	// Checked for the same reason as above — an unseeded boundary entry cannot leak.
	c, w = newContext(uid, http.MethodPost, "/api/v1/food", map[string]any{
		"name": "Next local day", "meal": "snacks", "calories": 500,
		"logged_at": "2026-04-25T08:00:00Z",
	})
	th.LogFood(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("seed the next-local-day entry: %d %s", w.Code, w.Body.String())
	}
	// -420 = Los Angeles in April. 03:30Z minus 7h is 20:30 on the 24th, so the
	// workout names the 24th itself rather than being resolved through a zone.
	if _, err := db.DB.Exec(
		`INSERT INTO workouts (user_id, name, started_at, tz_offset_minutes) VALUES (?, ?, ?, ?)`,
		uid, "Evening lift", time.Date(2026, 4, 25, 3, 30, 0, 0, time.UTC), -420,
	); err != nil {
		t.Fatalf("insert workout: %v", err)
	}

	c, w = newContext(uid, http.MethodGet, "/api/v1/food/stats?date=2026-04-24", nil)
	th.GetDailyStats(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	data := decodeResponse(t, w)["data"].(map[string]any)
	if got := data["total_calories"].(float64); got != 800 {
		t.Errorf("expected total_calories=800 (local day only), got %v", got)
	}
	if got := data["workout_count"].(float64); got != 1 {
		t.Errorf("expected workout_count=1 on the same local day, got %v", got)
	}
	if got := data["date"].(string); got != "2026-04-24" {
		t.Errorf("expected date label 2026-04-24, got %v", got)
	}
}

// setUserTimezone stores an IANA zone for the user, the way a client's settings
// PATCH would.
func setUserTimezone(t *testing.T, uid int64, tz string) {
	t.Helper()
	if _, err := db.DB.Exec(
		`INSERT INTO user_settings (user_id, timezone) VALUES (?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone`,
		uid, tz,
	); err != nil {
		t.Fatalf("set timezone: %v", err)
	}
}

// An entry's day is decided by the user's zone at read time — so a client that only
// ever sends an instant (every build shipped) lands on the right day.
func TestListFoodLogs_bucketsByUserTimezone(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "America/New_York")

	// 01:00 UTC on the 25th is 21:00 on the 24th in New York.
	insertFoodLogAt(t, uid, "Late dinner", 800, time.Date(2026, 4, 25, 1, 0, 0, 0, time.UTC))
	// 05:00 UTC on the 25th is 01:00 on the 25th — the next local day.
	insertFoodLogAt(t, uid, "Midnight snack", 200, time.Date(2026, 4, 25, 5, 0, 0, 0, time.UTC))

	c, w := newContext(uid, http.MethodGet, "/api/v1/food?date=2026-04-24", nil)
	th.ListFoodLogs(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	logs := decodeResponse(t, w)["data"].([]any)
	if len(logs) != 1 {
		t.Fatalf("expected only the 24th's local entry, got %d", len(logs))
	}
	if name := logs[0].(map[string]any)["name"].(string); name != "Late dinner" {
		t.Errorf("expected the 21:00-local entry, got %q", name)
	}
}

// UTC+14 is the case noon-anchoring alone cannot survive: local noon on the 24th is
// 22:00 UTC on the *23rd*, so a UTC date prefix files it a day early. This is the
// whole reason the server needs to know the zone.
func TestListFoodLogs_farEastTimezone(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "Pacific/Kiritimati") // UTC+14

	insertFoodLogAt(t, uid, "Local noon", 600, time.Date(2026, 4, 23, 22, 0, 0, 0, time.UTC))

	c, w := newContext(uid, http.MethodGet, "/api/v1/food?date=2026-04-24", nil)
	th.ListFoodLogs(c)
	if n := len(decodeResponse(t, w)["data"].([]any)); n != 1 {
		t.Fatalf("expected the entry on its local day 2026-04-24, got %d", n)
	}
}

// Spring forward: 2026-03-08 is 23 hours long in New York, so the day must end at
// the next local midnight rather than 24h after the first.
func TestGetDailyStats_dstSpringForwardDayIs23Hours(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "America/New_York")

	// 2026-03-08 is 23 hours long in New York: the day starts at 05:00 UTC (EST) and
	// ends at 04:00 UTC on the 9th (EDT), because the clocks jump at 02:00 local.
	//
	// The fixture that matters is the one in [04:00, 05:00) UTC on the 9th. That hour
	// is *outside* the real day but *inside* a naive start+24h window, so it is the
	// only entry that can tell the two apart. Without it this test passes whether
	// localDayRange uses AddDate(0, 0, 1) or Add(24 * time.Hour).
	insertFoodLogAt(t, uid, "Inside, 23:00 local on the 8th", 400, time.Date(2026, 3, 9, 3, 0, 0, 0, time.UTC))
	insertFoodLogAt(t, uid, "The 24th hour that does not exist", 900, time.Date(2026, 3, 9, 4, 30, 0, 0, time.UTC))

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/stats?date=2026-03-08", nil)
	th.GetDailyStats(c)
	if got := decodeResponse(t, w)["data"].(map[string]any)["total_calories"].(float64); got != 400 {
		t.Errorf("expected 400 — the 23h day ends at 04:00 UTC, so the 04:30 entry belongs to the 9th; got %v", got)
	}
}

// The mirror case: 2026-11-01 is 25 hours long in New York, so the day must not end
// an hour early. An entry in [04:00, 05:00) UTC on the 2nd is inside the real day and
// outside a naive start+24h window — the opposite failure from spring forward.
func TestGetDailyStats_dstFallBackDayIs25Hours(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "America/New_York")

	insertFoodLogAt(t, uid, "The 25th hour", 400, time.Date(2026, 11, 2, 4, 30, 0, 0, time.UTC))
	insertFoodLogAt(t, uid, "Next local day", 900, time.Date(2026, 11, 2, 5, 30, 0, 0, time.UTC))

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/stats?date=2026-11-01", nil)
	th.GetDailyStats(c)
	if got := decodeResponse(t, w)["data"].(map[string]any)["total_calories"].(float64); got != 400 {
		t.Errorf("expected 400 — the 25h day runs to 05:00 UTC on the 2nd; got %v", got)
	}
}

// The chart and the totals above it must agree about which day an entry is on —
// they now resolve it the same way, which is the point of having one mechanism.
func TestGetFoodHistory_agreesWithDailyTotals(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "America/New_York")

	// A fixed instant with a hard-coded expected day, rather than deriving the day
	// with the same zone lookup the endpoints use — that would let a wrong lookup
	// agree with itself. 01:00 UTC on Aug 8 is 21:00 on Aug 7 in New York.
	insertFoodLogAt(t, uid, "Late dinner", 700, time.Date(2026, 8, 8, 1, 0, 0, 0, time.UTC))
	const day = "2026-08-07"

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/stats?date="+day, nil)
	th.GetDailyStats(c)
	dailyCals := decodeResponse(t, w)["data"].(map[string]any)["total_calories"].(float64)
	if dailyCals != 700 {
		t.Fatalf("daily totals put the 21:00-local entry somewhere else: got %v for %s", dailyCals, day)
	}

	c, w = newContext(uid, http.MethodGet, "/api/v1/food/history?days=400", nil)
	th.GetFoodHistory(c)
	for _, p := range decodeResponse(t, w)["data"].([]any) {
		if pt := p.(map[string]any); pt["date"].(string) == day {
			if pt["calories"].(float64) != dailyCals {
				t.Errorf("history says %v for %s, daily totals say %v", pt["calories"], day, dailyCals)
			}
			return
		}
	}
	t.Errorf("history has no bucket for %s, but the daily total is %v", day, dailyCals)
}

// An unloadable zone must be rejected at write time rather than silently making
// every later query fall back to UTC.
func TestUpdateSettings_rejectsUnknownTimezone(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodPatch, "/api/v1/settings", map[string]any{"timezone": "Mars/Olympus_Mons"})
	th.UpdateSettings(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for an unknown zone, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateSettings_acceptsIANAZoneAndPreservesOtherFields(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodPatch, "/api/v1/settings", map[string]any{"calorie_target": 2500})
	th.UpdateSettings(c)
	if w.Code != http.StatusOK {
		t.Fatalf("seed settings: %d %s", w.Code, w.Body.String())
	}

	c, w = newContext(uid, http.MethodPatch, "/api/v1/settings", map[string]any{"timezone": "Europe/Berlin"})
	th.UpdateSettings(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	data := decodeResponse(t, w)["data"].(map[string]any)
	if data["timezone"].(string) != "Europe/Berlin" {
		t.Errorf("expected stored zone, got %v", data["timezone"])
	}
	// The COALESCE merge must not let a timezone-only PATCH reset the target.
	if data["calorie_target"].(float64) != 2500 {
		t.Errorf("timezone-only update clobbered calorie_target: %v", data["calorie_target"])
	}
}

// Changing zones must NOT move an entry, at any distance.
//
// This is the inverse of the test it replaces. While the day was derived from the
// account's zone at read time, a New York entry read from Tokyo — 13 hours away —
// landed on the following day, because a noon anchor only absorbs a shift while
// |offset delta| < 12. Now the day is stored on the row, so no distance is far
// enough. Tokyo is kept as a case precisely because it is the one that used to fail.
func TestListFoodLogs_zoneChangeDoesNotMoveStoredDay(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	setUserTimezone(t, uid, "America/New_York")
	// Local noon on the 4th for a New York account (UTC-4 in August).
	insertFoodLogAt(t, uid, "Lunch", 600, time.Date(2026, 8, 4, 16, 0, 0, 0, time.UTC))

	countOn := func(zone, date string) int {
		t.Helper()
		setUserTimezone(t, uid, zone)
		c, w := newContext(uid, http.MethodGet, "/api/v1/food?date="+date, nil)
		th.ListFoodLogs(c)
		if w.Code != http.StatusOK {
			t.Fatalf("%s %s: expected 200, got %d: %s", zone, date, w.Code, w.Body.String())
		}
		return len(decodeResponse(t, w)["data"].([]any))
	}

	for _, tc := range []struct {
		zone, date string
		want       int
		why        string
	}{
		{"America/New_York", "2026-08-04", 1, "the day it was filed under"},
		{"Pacific/Honolulu", "2026-08-04", 1, "6h away, still the 4th"},
		{"Pacific/Honolulu", "2026-08-05", 0, "and not also on the 5th"},
		{"Asia/Tokyo", "2026-08-04", 1, "13h away — this is the case that used to move"},
		{"Asia/Tokyo", "2026-08-05", 0, "it must not appear on the 5th any more"},
		{"Pacific/Kiritimati", "2026-08-04", 1, "UTC+14, the widest gap there is"},
	} {
		if got := countOn(tc.zone, tc.date); got != tc.want {
			t.Errorf("%s on %s: got %d entries, want %d (%s)", tc.zone, tc.date, got, tc.want, tc.why)
		}
	}
}

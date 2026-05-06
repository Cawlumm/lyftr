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
		`INSERT INTO food_logs (user_id, name, meal, calories, protein, carbs, fat, fiber, servings, serving_size, barcode, image_url, logged_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, '', '', '', ?)`,
		uid, name, meal, calories, protein, carbs, fat,
		loggedAt.Format("2006-01-02T15:04:05Z"),
	)
	if err != nil {
		t.Fatalf("insertFoodLog: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
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
	ListFoodLogs(c)

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

	today := time.Now()
	yesterday := today.AddDate(0, 0, -1)

	insertFoodLog(t, uid, "Breakfast today", "breakfast", 400, 30, 50, 10, today)
	insertFoodLog(t, uid, "Lunch yesterday", "lunch", 600, 40, 60, 15, yesterday)
	insertFoodLog(t, other, "Other user today", "dinner", 500, 25, 55, 12, today)

	date := today.Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, "/api/v1/food?date="+date, nil)
	ListFoodLogs(c)

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
	GetFoodLog(c)

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
	GetFoodLog(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user get, got %d", w.Code)
	}
}

func TestGetFoodLog_invalidID(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/abc", nil)
	setParam(c, "id", "abc")
	GetFoodLog(c)

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
	LogFood(c)

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
	LogFood(c)

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
	LogFood(c)

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
	LogFood(c)

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
	LogFood(c)

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
	LogFood(c)

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
	UpdateFoodLog(c)

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
	UpdateFoodLog(c)

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
	UpdateFoodLog(c)

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
	DeleteFoodLog(c)

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
	DeleteFoodLog(c)

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

	date := time.Now().Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, "/api/v1/food/stats?date="+date, nil)
	GetDailyStats(c)

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

	today := time.Now()
	insertFoodLog(t, uid, "Breakfast", "breakfast", 500, 30, 60, 15, today)
	insertFoodLog(t, uid, "Lunch", "lunch", 700, 50, 80, 20, today)
	// Different date — must be excluded
	insertFoodLog(t, uid, "Yesterday", "dinner", 600, 40, 70, 18, today.AddDate(0, 0, -1))

	date := today.Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, "/api/v1/food/stats?date="+date, nil)
	GetDailyStats(c)

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
	today := time.Now()

	insertFoodLog(t, uid, "Mine", "breakfast", 400, 25, 50, 10, today)
	insertFoodLog(t, other, "Theirs", "lunch", 9999, 999, 999, 999, today)

	date := today.Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, "/api/v1/food/stats?date="+date, nil)
	GetDailyStats(c)

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
	GetFoodHistory(c)

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
	now := time.Now()

	// Two entries on same day → should be one aggregated point
	insertFoodLog(t, uid, "A", "breakfast", 400, 20, 50, 10, now.AddDate(0, 0, -1))
	insertFoodLog(t, uid, "B", "lunch", 600, 40, 70, 15, now.AddDate(0, 0, -1))
	// Entry outside window → excluded
	insertFoodLog(t, uid, "Old", "dinner", 500, 30, 60, 12, now.AddDate(0, 0, -10))

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/history?days=7", nil)
	GetFoodHistory(c)

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
	GetFoodHistory(c)

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
		LookupBarcode(c)
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
	LookupBarcode(c)

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
	LookupBarcode(c)

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
	LookupBarcode(c)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 forwarded, got %d", w.Code)
	}
}

// ─── SearchFood ───────────────────────────────────────────────────────────────

func TestSearchFood_missingQuery(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/search", nil)
	SearchFood(c)

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
	SearchFood(c)

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
	SearchFood(c)

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
	SearchFood(c)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for OFF 5xx, got %d", w.Code)
	}
}

// ─── ListSavedFoods ───────────────────────────────────────────────────────────

func TestListSavedFoods_empty(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodGet, "/api/v1/food/saved", nil)
	ListSavedFoods(c)

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
	ListSavedFoods(c)

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
	CreateSavedFood(c)

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

func TestCreateSavedFood_missingName(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{"calories": 100.0, "protein": 5.0, "carbs": 10.0, "fat": 3.0}
	c, w := newContext(uid, http.MethodPost, "/api/v1/food/saved", body)
	CreateSavedFood(c)

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
	DeleteSavedFood(c)

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
	DeleteSavedFood(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user delete, got %d", w.Code)
	}
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE id = ?`, id).Scan(&count)
	if count != 1 {
		t.Fatal("saved food was deleted by wrong user")
	}
}

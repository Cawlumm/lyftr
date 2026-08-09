package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/gin-gonic/gin"
)

func insertWeightLog(t *testing.T, uid int64, weight float64, loggedAt time.Time) int64 {
	t.Helper()
	res, err := db.DB.Exec(
		`INSERT INTO weight_logs (user_id, weight, notes, logged_at, logged_on) VALUES (?, ?, '', ?, ?)`,
		uid, weight, loggedAt, localDayFor(t, uid, loggedAt),
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
	th.ListWeightLogs(c)

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

	now := time.Now().UTC()
	insertWeightLog(t, uid, 180.0, now.AddDate(0, 0, -2))
	insertWeightLog(t, uid, 181.5, now.AddDate(0, 0, -1))
	insertWeightLog(t, uid, 179.0, now)
	insertWeightLog(t, otherUID, 999.0, now)

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight", nil)
	th.ListWeightLogs(c)

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

// Regression: multiple logs on the same calendar day share an identical
// logged_at (the frontend stamps every same-day entry at noon). Without an `id`
// tiebreaker, ORDER BY logged_at DESC returned the OLDEST of the tie first, so
// after re-logging the same day the UI kept showing the stale value (it reads
// items[0] for the current weight / prefill / duplicate warning).
func TestListWeightLogs_sameDayNewestFirst(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	day := time.Date(2026, 6, 29, 12, 0, 0, 0, time.UTC)
	insertWeightLog(t, uid, 181.0, day)
	insertWeightLog(t, uid, 186.0, day) // newer, identical timestamp

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight", nil)
	th.ListWeightLogs(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(data))
	}
	if first := data[0].(map[string]any); first["weight"].(float64) != 186.0 {
		t.Errorf("expected newest same-day entry (186) first, got %v", first["weight"])
	}
}

func TestGetWeightStats_latestPrefersNewestSameDay(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	day := time.Date(2026, 6, 29, 12, 0, 0, 0, time.UTC)
	insertWeightLog(t, uid, 181.0, day)
	insertWeightLog(t, uid, 186.0, day)

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight/stats", nil)
	th.GetWeightStats(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["latest"].(float64) != 186.0 {
		t.Errorf("latest: expected newest same-day (186), got %v", data["latest"])
	}
}

func TestListWeightLogs_dateRange(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	now := time.Now().UTC()
	insertWeightLog(t, uid, 180.0, now.AddDate(0, 0, -10))
	insertWeightLog(t, uid, 181.0, now.AddDate(0, 0, -5))
	insertWeightLog(t, uid, 182.0, now)

	from := now.AddDate(0, 0, -7).Format("2006-01-02")
	to := now.Format("2006-01-02")
	c, w := newContext(uid, http.MethodGet, fmt.Sprintf("/api/v1/weight?from=%s&to=%s", from, to), nil)
	th.ListWeightLogs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 2 {
		t.Fatalf("expected 2 entries within range, got %d", len(data))
	}
}

// A day range matches on the day the entry was filed under, not on where its instant
// falls in UTC. A UTC-7 user logging noon on the 25th stores 2026-04-25T19:00:00Z;
// every previous version of this filter had to widen the UTC window to catch it, and
// each widening was a guess about how far the user might have been from UTC. Matching
// logged_on needs no guess.
func TestListWeightLogs_dateRangeWestTimezone(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	loggedAt := time.Date(2026, 4, 25, 19, 0, 0, 0, time.UTC)
	insertWeightLog(t, uid, 175.0, loggedAt)

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight?from=2026-04-25&to=2026-04-25", nil)
	th.ListWeightLogs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := decodeResponse(t, w)
	data := resp["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("expected 1 entry across TZ-padded day, got %d", len(data))
	}
}

// A range bound that isn't a day is rejected rather than silently dropped. Ignoring it
// would answer a narrow question with the whole history, which reads as data loss in
// reverse — a chart that quietly shows more than it was asked for.
func TestListWeightLogs_dateRangeRejectsNonDayBound(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	insertWeightLog(t, uid, 175.0, time.Date(2026, 4, 25, 10, 0, 0, 0, time.UTC))

	for _, q := range []string{
		"/api/v1/weight?from=2026-04-25T12:00:00Z",
		"/api/v1/weight?to=not-a-date",
	} {
		c, w := newContext(uid, http.MethodGet, q, nil)
		th.ListWeightLogs(c)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", q, w.Code)
		}
	}
}

func TestLogWeight_success(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{"weight": 185.5, "notes": "morning"}
	c, w := newContext(uid, http.MethodPost, "/api/v1/weight", body)
	th.LogWeight(c)

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

// One weight per calendar day: re-logging a day the user already logged updates
// that entry in place rather than creating a duplicate.
func TestLogWeight_sameDayUpdatesInPlace(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	day := "2026-06-29T12:00:00Z"
	c1, w1 := newContext(uid, http.MethodPost, "/api/v1/weight",
		map[string]any{"weight": 181.0, "notes": "am", "logged_at": day})
	th.LogWeight(c1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("first log: expected 201, got %d: %s", w1.Code, w1.Body.String())
	}

	c2, w2 := newContext(uid, http.MethodPost, "/api/v1/weight",
		map[string]any{"weight": 186.0, "notes": "pm", "logged_at": day})
	th.LogWeight(c2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("second log: expected 201, got %d: %s", w2.Code, w2.Body.String())
	}

	var count int
	var weight float64
	var notes string
	if err := db.DB.QueryRow(
		`SELECT COUNT(*), MAX(weight), MAX(notes) FROM weight_logs WHERE user_id = ?`,
		uid,
	).Scan(&count, &weight, &notes); err != nil {
		t.Fatalf("query: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 entry for the day (upsert), got %d", count)
	}
	if weight != 186.0 {
		t.Errorf("expected updated weight 186, got %v", weight)
	}
	if notes != "pm" {
		t.Errorf("expected updated notes 'pm', got %q", notes)
	}
}

// Different days still create separate entries.
func TestLogWeight_differentDaysCoexist(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	for _, d := range []string{"2026-06-27T12:00:00Z", "2026-06-28T12:00:00Z"} {
		c, w := newContext(uid, http.MethodPost, "/api/v1/weight",
			map[string]any{"weight": 180.0, "logged_at": d})
		th.LogWeight(c)
		if w.Code != http.StatusCreated {
			t.Fatalf("log %s: expected 201, got %d", d, w.Code)
		}
	}
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM weight_logs WHERE user_id = ?`, uid).Scan(&count)
	if count != 2 {
		t.Fatalf("expected 2 entries across 2 days, got %d", count)
	}
}

// A client-supplied non-UTC offset timestamp must not 500; it's normalized to
// UTC (a non-UTC time.Time otherwise fails to scan back from SQLite).
func TestLogWeight_normalizesOffsetToUTC(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	c, w := newContext(uid, http.MethodPost, "/api/v1/weight",
		map[string]any{"weight": 190.0, "logged_at": "2026-07-16T20:00:00-05:00"})
	th.LogWeight(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("offset ts: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	// 2026-07-16T20:00:00-05:00 == 2026-07-17T01:00:00Z
	data := decodeResponse(t, w)["data"].(map[string]any)
	if got := data["logged_at"].(string); got != "2026-07-17T01:00:00Z" {
		t.Errorf("expected UTC-normalized 2026-07-17T01:00:00Z, got %v", got)
	}
}

func TestLogWeight_rejectsNonPositive(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{"weight": 0}
	c, w := newContext(uid, http.MethodPost, "/api/v1/weight", body)
	th.LogWeight(c)

	if w.Code == http.StatusCreated {
		t.Fatal("expected validation error for weight=0, got 201")
	}
}

func TestLogWeight_rejectsImplausiblyLarge(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	body := map[string]any{"weight": 9999}
	c, w := newContext(uid, http.MethodPost, "/api/v1/weight", body)
	th.LogWeight(c)

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
	th.UpdateWeightLog(c)

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

// Editing an entry's date onto a day that already has another entry keeps the
// day to a single entry (the edited one) — consistent with the log-time upsert.
func TestUpdateWeightLog_dedupsOnTargetDay(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	a := insertWeightLog(t, uid, 180.0, time.Date(2026, 7, 20, 12, 0, 0, 0, time.UTC))
	b := insertWeightLog(t, uid, 185.0, time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC))

	// Move B onto day 07-20 (where A lives).
	body := map[string]any{"weight": 186.0, "logged_at": "2026-07-20T12:00:00Z"}
	c, w := newContext(uid, http.MethodPatch, "/api/v1/weight/"+fmt.Sprint(b), body)
	setParam(c, "id", fmt.Sprint(b))
	th.UpdateWeightLog(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM weight_logs WHERE user_id = ?`, uid).Scan(&count)
	if count != 1 {
		t.Fatalf("expected 1 entry after edit-merge (A dropped), got %d", count)
	}
	var survivingID int64
	var weight float64
	db.DB.QueryRow(`SELECT id, weight FROM weight_logs WHERE user_id = ?`, uid).Scan(&survivingID, &weight)
	if survivingID != b || weight != 186.0 {
		t.Errorf("expected surviving entry to be the edited one (id=%d, w=186), got id=%d w=%v", b, survivingID, weight)
	}
	_ = a
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
	th.UpdateWeightLog(c)

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
	th.DeleteWeightLog(c)

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
	now := time.Now().UTC()
	insertWeightLog(t, uid, 180.0, now.AddDate(0, 0, -40))
	insertWeightLog(t, uid, 178.0, now.AddDate(0, 0, -20))
	insertWeightLog(t, uid, 176.0, now.AddDate(0, 0, -5))
	insertWeightLog(t, uid, 175.0, now.AddDate(0, 0, -1))

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight/stats", nil)
	th.GetWeightStats(c)

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
	th.GetWeightStats(c)

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

// Regression: moving an entry's date must move that entry and leave the day it
// moves onto intact. The one-entry-per-day rule is evaluated over the user's local
// day, so both halves are asserted — either alone would pass a broken version.
func TestUpdateWeightLog_movingTheDayDoesNotDeleteTheTargetDaysEntry(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "America/New_York")

	// Local noon on each day, the anchor every client writes.
	c, w := newContext(uid, http.MethodPost, "/api/v1/weight", map[string]any{
		"weight": 200, "logged_at": "2026-08-05T16:00:00Z",
	})
	th.LogWeight(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("seed Aug 5: %d %s", w.Code, w.Body.String())
	}
	movedID := int64(decodeResponse(t, w)["data"].(map[string]any)["id"].(float64))

	c, w = newContext(uid, http.MethodPost, "/api/v1/weight", map[string]any{
		"weight": 201, "logged_at": "2026-08-06T16:00:00Z",
	})
	th.LogWeight(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("seed Aug 6: %d %s", w.Code, w.Body.String())
	}

	// Move the Aug 5 entry onto Aug 6, the way the edit form does.
	c, w = newContext(uid, http.MethodPatch, "/api/v1/weight/"+strconv.FormatInt(movedID, 10),
		map[string]any{"weight": 200, "logged_at": "2026-08-06T16:00:00Z"})
	c.Params = gin.Params{{Key: "id", Value: strconv.FormatInt(movedID, 10)}}
	th.UpdateWeightLog(c)
	if w.Code != http.StatusOK {
		t.Fatalf("update: %d %s", w.Code, w.Body.String())
	}

	// Bounds are hard-coded, not re-derived through localDayRange. Verifying with the
	// function under test means a wrong day window agrees with itself and the test
	// passes anyway. New York in August is UTC-4, so the local day runs 04:00 UTC to
	// 04:00 UTC the next morning.
	// Bound as time.Time, not as strings: the driver encodes a DATETIME column its
	// own way, and a string literal doesn't compare against it — the same trap that
	// made these range queries silently match nothing earlier in this branch.
	countBetween := func(fromUTC, toUTC string) int {
		t.Helper()
		from, err := time.Parse(time.RFC3339, fromUTC)
		if err != nil {
			t.Fatal(err)
		}
		to, err := time.Parse(time.RFC3339, toUTC)
		if err != nil {
			t.Fatal(err)
		}
		var n int
		if err := db.DB.QueryRow(
			`SELECT COUNT(*) FROM weight_logs WHERE user_id = ? AND logged_at >= ? AND logged_at < ?`,
			uid, from, to,
		).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	if n := countBetween("2026-08-06T04:00:00Z", "2026-08-07T04:00:00Z"); n != 1 {
		t.Errorf("expected exactly one entry on the target day, got %d", n)
	}
	if n := countBetween("2026-08-05T04:00:00Z", "2026-08-06T04:00:00Z"); n != 0 {
		t.Errorf("expected nothing left on the old day, got %d", n)
	}
}

// The bare-day from/to filter resolves through the user's stored zone now that the
// -12h/+36h widening is gone. TestListWeightLogs_dateRange covers the UTC default;
// this covers a real zone, where a device-derived day and a UTC day disagree.
func TestListWeightLogs_bareDayRangeUsesStoredTimezone(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "Pacific/Auckland") // UTC+12/+13

	// 2026-04-24 local noon in Auckland is 2026-04-24T00:00:00Z. A UTC-bucketed
	// filter for the 24th would still include it, so the discriminating entry is the
	// one at 23:00Z on the 23rd — local 11:00 on the 24th.
	insertWeightLog(t, uid, 180.0, time.Date(2026, 4, 23, 23, 0, 0, 0, time.UTC))
	// Local 11:00 on the 25th — outside the requested day either way.
	insertWeightLog(t, uid, 181.0, time.Date(2026, 4, 24, 23, 0, 0, 0, time.UTC))

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight?from=2026-04-24&to=2026-04-24", nil)
	th.ListWeightLogs(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	data := decodeResponse(t, w)["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("expected the entry on the user's local 24th, got %d", len(data))
	}
	if got := data[0].(map[string]any)["weight"].(float64); got != 180.0 {
		t.Errorf("expected the 11:00-local entry (180), got %v", got)
	}
}

// One-entry-per-day on the CREATE path. The update path is covered above; this is
// UpsertForDay's dedup, which replaced dayBounds' UTC window with zone-resolved
// bounds and had no test over a non-UTC day.
func TestLogWeight_oneEntryPerLocalDayOnCreate(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	setUserTimezone(t, uid, "America/New_York")

	// Both are the same New York day (Aug 7): 20:00 local and 23:00 local. They are
	// also the same UTC day, so this alone wouldn't discriminate — the second pair
	// below does.
	for _, at := range []string{"2026-08-08T00:00:00Z", "2026-08-08T03:00:00Z"} {
		c, w := newContext(uid, http.MethodPost, "/api/v1/weight", map[string]any{"weight": 200, "logged_at": at})
		th.LogWeight(c)
		if w.Code != http.StatusCreated {
			t.Fatalf("log at %s: %d %s", at, w.Code, w.Body.String())
		}
	}

	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM weight_logs WHERE user_id = ?`, uid).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("both entries are on the user's Aug 7; expected one row, got %d", n)
	}

	// A different local day that shares a UTC day with the first: 2026-08-07T20:00Z
	// is Aug 7 in UTC but 16:00 on Aug 7 local... and 2026-08-08T00:00Z (already
	// logged) is Aug 8 in UTC. A UTC-bucketed dedup would treat these as different
	// days and leave two rows; the local-day rule collapses them.
	c, w := newContext(uid, http.MethodPost, "/api/v1/weight", map[string]any{"weight": 202, "logged_at": "2026-08-07T20:00:00Z"})
	th.LogWeight(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("log the same local day from a different UTC day: %d %s", w.Code, w.Body.String())
	}
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM weight_logs WHERE user_id = ?`, uid).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("all three instants fall on the user's Aug 7; expected one row, got %d", n)
	}
}

// Newest day first, even when the newest day is not the newest instant. Once a row's
// day comes from logged_on, the two orderings part company: an entry filed for the 10th
// from UTC+14 happened at an earlier moment than one filed for the 9th from UTC-11, so
// ordering by the timestamp alone renders the list out of the order it appears to be in.
func TestListWeightLogs_ordersByStoredDayNotInstant(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	insertWeightLogOn(t, uid, 180.0, "2026-08-10", "2026-08-09T22:00:00Z") // later day, earlier instant
	insertWeightLogOn(t, uid, 170.0, "2026-08-09", "2026-08-09T23:00:00Z") // earlier day, later instant

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight?limit=2", nil)
	th.ListWeightLogs(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	data := decodeResponse(t, w)["data"].([]any)
	if len(data) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(data))
	}
	if day := data[0].(map[string]any)["logged_on"]; day != "2026-08-10" {
		t.Fatalf("newest day not first: got %v, want 2026-08-10", day)
	}
}

func insertWeightLogOn(t *testing.T, uid int64, weight float64, day, loggedAt string) {
	t.Helper()
	if _, err := db.DB.Exec(
		`INSERT INTO weight_logs (user_id, weight, notes, logged_at, logged_on) VALUES (?, ?, '', ?, ?)`,
		uid, weight, loggedAt, day,
	); err != nil {
		t.Fatalf("insert weight log: %v", err)
	}
}

// A row the backfill could not date must not distort the summary or vanish from
// windows. logged_on defaults to ”, which sorts before every real date: read raw, an
// unset row is simultaneously the "starting" weight (first ASC) and never the "latest"
// (last DESC), and `logged_on >= ?` hides it from every range. Reads fall back to the
// instant's own date so it lands in one sensible place instead of two wrong ones.
//
// The unset row here carries the LATEST instant, so the two rules disagree: raw makes
// it oldest, the fallback makes it newest.
func TestWeightReads_unsetDayFallsBackToTheInstant(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)

	insertWeightLogOn(t, uid, 200.0, "", "2026-08-09T12:00:00Z")           // unset day, newest instant
	insertWeightLogOn(t, uid, 170.0, "2026-08-05", "2026-08-05T12:00:00Z") // dated, older

	c, w := newContext(uid, http.MethodGet, "/api/v1/weight/stats", nil)
	th.GetWeightStats(c)
	if w.Code != http.StatusOK {
		t.Fatalf("stats: expected 200, got %d", w.Code)
	}
	stats := decodeResponse(t, w)["data"].(map[string]any)
	if got := stats["latest"].(float64); got != 200.0 {
		t.Errorf("latest weight = %v, want 200 (the newest day, not the one with a blank logged_on)", got)
	}
	if got := stats["starting"].(float64); got != 170.0 {
		t.Errorf("starting weight = %v, want 170 (a blank logged_on must not sort before every real date)", got)
	}

	// And the same row must still be reachable through a day range that contains it.
	c, w = newContext(uid, http.MethodGet, "/api/v1/weight?from=2026-08-08&to=2026-08-10", nil)
	th.ListWeightLogs(c)
	if w.Code != http.StatusOK {
		t.Fatalf("list: expected 200, got %d", w.Code)
	}
	data := decodeResponse(t, w)["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("range returned %d entries, want 1 — an undated row dropped out of its own window", len(data))
	}
}

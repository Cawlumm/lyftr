package utils

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
)

func testCtx() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/x", nil)
	return c, w
}

// uniqueErr returns a real modernc UNIQUE-constraint error.
func uniqueErr(t *testing.T) error {
	t.Helper()
	d, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err := d.Exec(`CREATE TABLE t (x TEXT UNIQUE)`); err != nil {
		t.Fatal(err)
	}
	d.Exec(`INSERT INTO t VALUES ('a')`)
	_, err = d.Exec(`INSERT INTO t VALUES ('a')`)
	if err == nil {
		t.Fatal("expected unique violation")
	}
	return err
}

// busyErr returns a real modernc SQLITE_BUSY error by writing from a second
// connection while a write lock is held on the first.
func busyErr(t *testing.T) error {
	t.Helper()
	path := t.TempDir() + "/busy.db"
	a, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(0)")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if _, err := a.Exec(`CREATE TABLE t (id INTEGER PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	tx, err := a.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(`INSERT INTO t (id) VALUES (1)`); err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()

	b, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(0)")
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	_, err = b.Exec(`INSERT INTO t (id) VALUES (2)`)
	if err == nil {
		t.Fatal("expected busy error")
	}
	return err
}

func TestClassifiers(t *testing.T) {
	uniq := uniqueErr(t)
	busy := busyErr(t)

	if !IsUniqueViolation(uniq) {
		t.Errorf("IsUniqueViolation(unique) = false, want true")
	}
	if IsLocked(uniq) {
		t.Errorf("IsLocked(unique) = true, want false")
	}
	if !IsLocked(busy) {
		t.Errorf("IsLocked(busy) = false, want true")
	}
	if IsUniqueViolation(busy) {
		t.Errorf("IsUniqueViolation(busy) = true, want false")
	}
	if IsLocked(errors.New("plain")) || IsUniqueViolation(errors.New("plain")) {
		t.Errorf("plain error should classify as neither")
	}
}

func TestDBError(t *testing.T) {
	busy := busyErr(t)

	cases := []struct {
		name     string
		err      error
		handled  bool
		wantCode int
	}{
		{"nil", nil, false, http.StatusOK},                    // 200 = recorder default, nothing written
		{"no rows", sql.ErrNoRows, false, http.StatusOK},      // caller's responsibility
		{"locked", busy, true, http.StatusServiceUnavailable}, // retryable 503
		{"generic", errors.New("boom"), true, http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := testCtx()
			if got := DBError(c, tc.err); got != tc.handled {
				t.Fatalf("DBError handled = %v, want %v", got, tc.handled)
			}
			if w.Code != tc.wantCode {
				t.Fatalf("status = %d, want %d", w.Code, tc.wantCode)
			}
			if tc.handled && tc.wantCode == http.StatusServiceUnavailable {
				if got := bodyOf(t, w)["code"]; got != "DATABASE_BUSY" || w.Header().Get("Retry-After") != "2" {
					t.Fatalf("code = %v, Retry-After = %q", got, w.Header().Get("Retry-After"))
				}
			}
			if tc.handled && tc.wantCode == http.StatusInternalServerError {
				if b := bodyOf(t, w); b["code"] != "INTERNAL_ERROR" || b["error"] != "Something went wrong on the server." {
					t.Fatalf("body = %v", b)
				}
			}
		})
	}
}

func bodyOf(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var b map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &b); err != nil {
		t.Fatal(err)
	}
	return b
}

func TestFailWritesACode(t *testing.T) {
	c, w := testCtx()
	Fail(c, CodeFoodDatabaseTimeout, nil)
	if b := bodyOf(t, w); w.Code != 503 || b["code"] != "FOOD_DATABASE_TIMEOUT" ||
		b["error"] != "The food database didn't respond in time. Try again." || w.Header().Get("Retry-After") != "2" {
		t.Fatalf("503 code = %d %v retry %q", w.Code, b, w.Header().Get("Retry-After"))
	}

	c, w = testCtx()
	Fail(c, CodeEntryNotFound, nil)
	if b := bodyOf(t, w); w.Code != 404 || b["code"] != "ENTRY_NOT_FOUND" || b["params"] != nil || w.Header().Get("Retry-After") != "" {
		t.Fatalf("404 code = %d %v", w.Code, b)
	}

	c, w = testCtx()
	Fail(c, CodeEmailTaken, nil)
	if b := bodyOf(t, w); w.Code != 409 || b["code"] != "EMAIL_TAKEN" || b["error"] != "That email is already registered." {
		t.Fatalf("Fail = %d %v", w.Code, b)
	}
	if _, has := bodyOf2(w)["params"]; has {
		t.Fatal("Fail wrote an empty params key")
	}
}

func bodyOf2(w *httptest.ResponseRecorder) map[string]any {
	var b map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &b)
	return b
}

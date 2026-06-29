package controllers

import (
	"database/sql"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	_ "modernc.org/sqlite"
)

// setupFileDB points db.DB at a fresh on-disk database with busy_timeout(0), so a
// contended write lock surfaces as SQLITE_BUSY immediately instead of waiting. It
// also rebuilds the DI handler (th) bound to this DB.
func setupFileDB(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "lock.db")
	var err error
	db.DB, err = sql.Open("sqlite", path+"?_pragma=busy_timeout(0)")
	if err != nil {
		t.Fatalf("open file db: %v", err)
	}
	db.DB.SetMaxOpenConns(1)
	if err = db.DB.Ping(); err != nil {
		t.Fatalf("ping file db: %v", err)
	}
	if err = applySchema(); err != nil {
		t.Fatalf("apply schema: %v", err)
	}
	th = NewHandler(stores.New(db.DB))
	t.Cleanup(func() { db.DB.Close() })
	return path
}

// TestRegister_lockedDBReturns503 reproduces issue #25: when the database is
// locked, Register must return a retryable 503 — not a misleading "email already
// registered" (which is what a blanket "any Exec error == duplicate" produced).
func TestRegister_lockedDBReturns503(t *testing.T) {
	path := setupFileDB(t)

	// Hold a write lock on a separate connection so Register's INSERT can't proceed.
	locker, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(0)")
	if err != nil {
		t.Fatalf("open locker: %v", err)
	}
	defer locker.Close()
	tx, err := locker.Begin()
	if err != nil {
		t.Fatalf("begin lock tx: %v", err)
	}
	if _, err := tx.Exec(`INSERT INTO users (email, password_hash) VALUES ('lock@example.com', 'h')`); err != nil {
		t.Fatalf("acquire write lock: %v", err)
	}
	defer tx.Rollback()

	c, w := newContext(0, http.MethodPost, "/api/v1/auth/register",
		map[string]string{"email": "new@example.com", "password": "password123"})
	th.Register(c)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("locked DB: expected 503, got %d (%s)", w.Code, w.Body.String())
	}
}

// TestRegister_duplicateEmailReturns409 confirms a genuine duplicate is still a
// conflict, and is now distinguishable from the lock case above.
func TestRegister_duplicateEmailReturns409(t *testing.T) {
	setupTestDB(t)
	createTestUser(t) // inserts test@example.com

	c, w := newContext(0, http.MethodPost, "/api/v1/auth/register",
		map[string]string{"email": "test@example.com", "password": "password123"})
	th.Register(c)

	if w.Code != http.StatusConflict {
		t.Fatalf("duplicate email: expected 409, got %d (%s)", w.Code, w.Body.String())
	}
}

// TestDBErrorClassifiers checks the shared classifier against real modernc errors.
func TestDBErrorClassifiers(t *testing.T) {
	setupTestDB(t)
	createTestUser(t)

	_, err := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('test@example.com', 'h')`)
	if err == nil {
		t.Fatal("expected a UNIQUE violation")
	}
	if !utils.IsUniqueViolation(err) {
		t.Errorf("IsUniqueViolation(%v) = false, want true", err)
	}
	if utils.IsLocked(err) {
		t.Errorf("IsLocked(%v) = true, want false", err)
	}
}

package controllers

import (
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
)

// TestDeleteAccountCascadesChildren guards that DeleteAccount relies on ON DELETE
// CASCADE — i.e. foreign keys must stay enforced. This is the behavioral guard
// for keeping foreign_keys(on) in the production DSN (PR #32 dropped it; we
// re-added it). The harness runs with foreign_keys=on, matching production.
func TestDeleteAccountCascadesChildren(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	if _, err := db.DB.Exec(`INSERT INTO weight_logs (user_id, weight) VALUES (?, 180)`, uid); err != nil {
		t.Fatalf("seed weight log: %v", err)
	}

	c, w := newContext(uid, http.MethodDelete, "/api/v1/me", nil)
	th.DeleteAccount(c)
	if w.Code != http.StatusOK {
		t.Fatalf("DeleteAccount: expected 200, got %d (%s)", w.Code, w.Body.String())
	}

	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM weight_logs WHERE user_id = ?`, uid).Scan(&n); err != nil {
		t.Fatalf("count after delete: %v", err)
	}
	if n != 0 {
		t.Errorf("child weight_logs not cascade-deleted: got %d, want 0 (foreign keys off?)", n)
	}
}

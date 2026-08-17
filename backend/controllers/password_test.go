package controllers

import (
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/utils"
)

// registerAndLogin creates a real account through the handler so the row carries a real
// bcrypt hash and token_version, then returns its id and refresh token.
func registerAndLogin(t *testing.T, email, password string) (int64, string) {
	t.Helper()
	c, w := newContext(0, "POST", "/api/v1/auth/register",
		map[string]string{"email": email, "password": password})
	th.Register(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("register status = %d, want 201", w.Code)
	}
	body := decodeResponse(t, w)
	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatalf("register response has no data object: %v", body)
	}
	refresh, _ := data["refresh_token"].(string)
	if refresh == "" {
		t.Fatal("register returned no refresh token")
	}
	user, _ := data["user"].(map[string]any)
	id, _ := user["id"].(float64)
	if id == 0 {
		t.Fatalf("register returned no user id: %v", data)
	}
	return int64(id), refresh
}

func changePassword(t *testing.T, uid int64, current, next string) (int, map[string]any) {
	t.Helper()
	c, w := newContext(uid, "PUT", "/api/v1/me/password",
		map[string]string{"current_password": current, "new_password": next})
	th.ChangePassword(c)
	return w.Code, decodeResponse(t, w)
}

func storedHash(t *testing.T, uid int64) string {
	t.Helper()
	var h string
	if err := db.DB.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, uid).Scan(&h); err != nil {
		t.Fatalf("read hash: %v", err)
	}
	return h
}

func tokenVersion(t *testing.T, uid int64) int {
	t.Helper()
	var v int
	if err := db.DB.QueryRow(`SELECT token_version FROM users WHERE id = ?`, uid).Scan(&v); err != nil {
		t.Fatalf("read token_version: %v", err)
	}
	return v
}

func refreshWith(t *testing.T, token string) int {
	t.Helper()
	c, w := newContext(0, "POST", "/api/v1/auth/refresh",
		map[string]string{"refresh_token": token})
	th.RefreshToken(c)
	return w.Code
}

func TestChangePasswordReplacesHashAndIssuesNewTokens(t *testing.T) {
	setupTestDB(t)
	uid, _ := registerAndLogin(t, "change@example.com", "password123")
	before := storedHash(t, uid)

	code, body := changePassword(t, uid, "password123", "newpassword456")
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", code, body)
	}

	after := storedHash(t, uid)
	if after == before {
		t.Error("password hash unchanged")
	}
	if !utils.CheckPassword("newpassword456", after) {
		t.Error("new password does not verify against the stored hash")
	}
	if utils.CheckPassword("password123", after) {
		t.Error("old password still verifies")
	}

	// The device that made the change must stay signed in.
	data, _ := body["data"].(map[string]any)
	if tok, _ := data["token"].(string); tok == "" {
		t.Error("no access token returned")
	}
	fresh, _ := data["refresh_token"].(string)
	if fresh == "" {
		t.Fatal("no refresh token returned")
	}
	if code := refreshWith(t, fresh); code != http.StatusOK {
		t.Errorf("refresh with the newly issued token = %d, want 200", code)
	}
}

// The reason the feature exists: a session opened before the change must not survive it.
func TestChangePasswordRevokesOtherSessions(t *testing.T) {
	setupTestDB(t)
	uid, oldRefresh := registerAndLogin(t, "revoke@example.com", "password123")

	// Sanity: that token works before the change, so a failure after it means something.
	if code := refreshWith(t, oldRefresh); code != http.StatusOK {
		t.Fatalf("pre-change refresh = %d, want 200", code)
	}

	if code, body := changePassword(t, uid, "password123", "newpassword456"); code != http.StatusOK {
		t.Fatalf("change status = %d, want 200 (%v)", code, body)
	}

	if code := refreshWith(t, oldRefresh); code != http.StatusUnauthorized {
		t.Errorf("post-change refresh with the old token = %d, want 401", code)
	}
	if v := tokenVersion(t, uid); v != 2 {
		t.Errorf("token_version = %d, want 2", v)
	}
}

func TestChangePasswordRejectsWrongCurrentPassword(t *testing.T) {
	setupTestDB(t)
	uid, refresh := registerAndLogin(t, "wrong@example.com", "password123")
	before := storedHash(t, uid)

	code, _ := changePassword(t, uid, "notmypassword", "newpassword456")
	if code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", code)
	}
	if storedHash(t, uid) != before {
		t.Error("hash changed despite a rejected current password")
	}
	// A failed attempt must not evict the legitimate sessions.
	if v := tokenVersion(t, uid); v != 1 {
		t.Errorf("token_version = %d, want 1", v)
	}
	if code := refreshWith(t, refresh); code != http.StatusOK {
		t.Errorf("refresh after a failed change = %d, want 200", code)
	}
}

func TestChangePasswordRejectsShortPassword(t *testing.T) {
	setupTestDB(t)
	uid, _ := registerAndLogin(t, "short@example.com", "password123")
	before := storedHash(t, uid)

	// 422, matching what Register returns for the same min=8 tag — the two paths must
	// not disagree about what a too-short password is.
	code, _ := changePassword(t, uid, "password123", "short")
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", code)
	}
	if storedHash(t, uid) != before {
		t.Error("hash changed despite a rejected new password")
	}
}

// Reusing the current password would otherwise bump token_version and sign every other
// device out for a change that did not happen.
func TestChangePasswordRejectsUnchangedPassword(t *testing.T) {
	setupTestDB(t)
	uid, refresh := registerAndLogin(t, "same@example.com", "password123")

	code, _ := changePassword(t, uid, "password123", "password123")
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
	if v := tokenVersion(t, uid); v != 1 {
		t.Errorf("token_version = %d, want 1", v)
	}
	if code := refreshWith(t, refresh); code != http.StatusOK {
		t.Errorf("refresh after a no-op change = %d, want 200", code)
	}
}

// The compare-and-set guard in the store: two changes racing off the same verified hash
// must not both succeed, or the loser's password wins while its user is told otherwise.
func TestChangePasswordConcurrentLoserConflicts(t *testing.T) {
	setupTestDB(t)
	uid, _ := registerAndLogin(t, "race@example.com", "password123")
	staleHash := storedHash(t, uid)

	if code, _ := changePassword(t, uid, "password123", "newpassword456"); code != http.StatusOK {
		t.Fatalf("first change failed")
	}

	// The second request verified against staleHash before the first landed.
	newHash, err := utils.HashPassword("thirdpassword789")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if _, err := th.s.User.ChangePassword(uid, staleHash, newHash); err == nil {
		t.Fatal("stale-hash change succeeded, want ErrPasswordChanged")
	}
	if !utils.CheckPassword("newpassword456", storedHash(t, uid)) {
		t.Error("the winning change was overwritten by the loser")
	}
	if v := tokenVersion(t, uid); v != 2 {
		t.Errorf("token_version = %d, want 2 (the loser must not bump it)", v)
	}
}

// Tokens minted before the "ver" claim existed decode as 0. Folding that up to 1 is what
// keeps existing installs signed in across the upgrade.
func TestLegacyTokenWithoutVersionStillRefreshes(t *testing.T) {
	setupTestDB(t)
	uid, _ := registerAndLogin(t, "legacy@example.com", "password123")

	_, legacyRefresh, err := utils.GenerateTokenPair(uid, "legacy@example.com", 0)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if code := refreshWith(t, legacyRefresh); code != http.StatusOK {
		t.Errorf("legacy refresh = %d, want 200", code)
	}

	// ...but it dies as soon as the password moves.
	if code, _ := changePassword(t, uid, "password123", "newpassword456"); code != http.StatusOK {
		t.Fatal("change failed")
	}
	if code := refreshWith(t, legacyRefresh); code != http.StatusUnauthorized {
		t.Errorf("legacy refresh after change = %d, want 401", code)
	}
}

func TestNormalizeTokenVersion(t *testing.T) {
	for _, tc := range []struct{ in, want int }{
		{-1, 1}, {0, 1}, {1, 1}, {2, 2}, {7, 7},
	} {
		if got := utils.NormalizeTokenVersion(tc.in); got != tc.want {
			t.Errorf("NormalizeTokenVersion(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

// A deleted account's refresh token must not be renewable.
func TestRefreshRejectsDeletedAccount(t *testing.T) {
	setupTestDB(t)
	uid, refresh := registerAndLogin(t, "gone@example.com", "password123")

	if err := th.s.User.Delete(uid); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if code := refreshWith(t, refresh); code != http.StatusUnauthorized {
		t.Errorf("refresh for a deleted account = %d, want 401", code)
	}
}

package controllers

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
)

func changeEmail(t *testing.T, uid int64, email, current string) (int, map[string]any) {
	t.Helper()
	body := map[string]string{"email": email}
	if current != "" {
		body["current_password"] = current
	}
	c, w := newContext(uid, "PUT", "/api/v1/me/email", body)
	th.ChangeEmail(c)
	return w.Code, decodeResponse(t, w)
}

func storedEmail(t *testing.T, uid int64) string {
	t.Helper()
	var e string
	if err := db.DB.QueryRow(`SELECT email FROM users WHERE id = ?`, uid).Scan(&e); err != nil {
		t.Fatalf("read email: %v", err)
	}
	return e
}

func storedUpdatedAt(t *testing.T, uid int64) string {
	t.Helper()
	var s string
	if err := db.DB.QueryRow(`SELECT CAST(updated_at AS TEXT) FROM users WHERE id = ?`, uid).Scan(&s); err != nil {
		t.Fatalf("read updated_at: %v", err)
	}
	return s
}

func errorOf(body map[string]any) string {
	s, _ := body["error"].(string)
	return s
}

func TestChangeEmailUpdatesAddressAndSignsOutOtherDevices(t *testing.T) {
	setupTestDB(t)
	uid, oldRefresh := registerAndLogin(t, "old@example.com", "password123")
	versionBefore := tokenVersion(t, uid)

	code, body := changeEmail(t, uid, "new@example.com", "password123")
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", code, body)
	}
	data, _ := body["data"].(map[string]any)
	user, _ := data["user"].(map[string]any)
	if user["email"] != "new@example.com" {
		t.Errorf("returned email = %v", user["email"])
	}
	newRefresh, _ := data["refresh_token"].(string)
	if tok, _ := data["token"].(string); tok == "" || newRefresh == "" {
		t.Errorf("response carries no token pair for this device: %v", data)
	}
	if got := storedEmail(t, uid); got != "new@example.com" {
		t.Errorf("stored email = %q", got)
	}
	if v := tokenVersion(t, uid); v != versionBefore+1 {
		t.Errorf("token_version = %d, want %d", v, versionBefore+1)
	}
	if code := refreshWith(t, oldRefresh); code != http.StatusUnauthorized {
		t.Errorf("refresh with the pre-change token = %d, want 401", code)
	}
	if code := refreshWith(t, newRefresh); code != http.StatusOK {
		t.Errorf("refresh with the token this device was handed = %d, want 200", code)
	}
	if code, _ := loginRequest(t, "new@example.com", "password123"); code != http.StatusOK {
		t.Errorf("login with the new address = %d, want 200", code)
	}
	if code, _ := loginRequest(t, "old@example.com", "password123"); code != http.StatusUnauthorized {
		t.Errorf("login with the old address = %d, want 401", code)
	}
}

func TestChangeEmailRejectsWrongCurrentPassword(t *testing.T) {
	setupTestDB(t)
	uid, _ := registerAndLogin(t, "old@example.com", "password123")

	code, body := changeEmail(t, uid, "new@example.com", "wrongpassword")
	if code != http.StatusUnauthorized || errorOf(body) != "Your current password is incorrect." {
		t.Fatalf("got %d %v", code, body)
	}
	if got := storedEmail(t, uid); got != "old@example.com" {
		t.Errorf("stored email = %q, want unchanged", got)
	}
}

func TestChangeEmailWrongPasswordDoesNotRevealTakenAddress(t *testing.T) {
	setupTestDB(t)
	registerAndLogin(t, "taken@example.com", "password123")
	uid, _ := registerAndLogin(t, "me@example.com", "password123")

	code, body := changeEmail(t, uid, "TAKEN@example.com", "wrongpassword")
	if code != http.StatusUnauthorized {
		t.Fatalf("got %d %v, want 401", code, body)
	}
}

func TestChangeEmailRejectsAddressHeldInAnotherCase(t *testing.T) {
	setupTestDB(t)
	registerAndLogin(t, "carter@example.com", "password123")
	uid, _ := registerAndLogin(t, "me@example.com", "password123")

	code, body := changeEmail(t, uid, "Carter@Example.COM", "password123")
	if code != http.StatusConflict || errorOf(body) != "That email is already registered." {
		t.Fatalf("got %d %v", code, body)
	}
	if got := storedEmail(t, uid); got != "me@example.com" {
		t.Errorf("stored email = %q, want unchanged", got)
	}
}

func TestChangeEmailOnACollidingInstall(t *testing.T) {
	setupTestDB(t)
	a, b := seedCollidingAccounts(t, "Carter@x.com", "password123", "carter@x.com", "password123")

	code, body := changeEmail(t, a, "CARTER@x.com", "password123")
	if code != http.StatusConflict {
		t.Fatalf("got %d %v, want 409", code, body)
	}
	if storedEmail(t, a) != "Carter@x.com" || storedEmail(t, b) != "carter@x.com" {
		t.Error("a stored email changed")
	}

	if code, body := changeEmail(t, a, "fresh@x.com", "password123"); code != http.StatusOK {
		t.Fatalf("move to a fresh address = %d %v, want 200", code, body)
	}
}

func TestChangeEmailAllowsChangingTheCaseOfOwnAddress(t *testing.T) {
	setupTestDB(t)
	uid, oldRefresh := registerAndLogin(t, "carter@example.com", "password123")
	versionBefore := tokenVersion(t, uid)

	code, body := changeEmail(t, uid, "Carter@Example.com", "password123")
	if code != http.StatusOK {
		t.Fatalf("got %d %v, want 200", code, body)
	}
	if got := storedEmail(t, uid); got != "Carter@Example.com" {
		t.Errorf("stored email = %q", got)
	}
	// Sign-in ignores case, so the identity is unchanged and no other session is ended.
	if v := tokenVersion(t, uid); v != versionBefore {
		t.Errorf("token_version = %d, want %d", v, versionBefore)
	}
	if code := refreshWith(t, oldRefresh); code != http.StatusOK {
		t.Errorf("refresh with the pre-change token = %d, want 200", code)
	}

	// A change that is more than case still ends them, even from the cased spelling.
	if code, body := changeEmail(t, uid, "other@example.com", "password123"); code != http.StatusOK {
		t.Fatalf("second change got %d %v", code, body)
	}
	if v := tokenVersion(t, uid); v != versionBefore+1 {
		t.Errorf("token_version after a real change = %d, want %d", v, versionBefore+1)
	}
	if code := refreshWith(t, oldRefresh); code != http.StatusUnauthorized {
		t.Errorf("refresh with the original token = %d, want 401", code)
	}
}

func TestChangeEmailSameAddressIsANoOp(t *testing.T) {
	setupTestDB(t)
	uid, oldRefresh := registerAndLogin(t, "same@example.com", "password123")
	before := storedUpdatedAt(t, uid)
	versionBefore := tokenVersion(t, uid)

	code, body := changeEmail(t, uid, "same@example.com", "password123")
	if code != http.StatusOK {
		t.Fatalf("got %d %v, want 200", code, body)
	}
	// Nothing changed, so nobody is signed out: the version stays and older sessions live.
	if v := tokenVersion(t, uid); v != versionBefore {
		t.Errorf("token_version = %d, want %d", v, versionBefore)
	}
	if code := refreshWith(t, oldRefresh); code != http.StatusOK {
		t.Errorf("refresh with the pre-request token = %d, want 200", code)
	}
	if got := storedEmail(t, uid); got != "same@example.com" {
		t.Errorf("stored email = %q", got)
	}
	if after := storedUpdatedAt(t, uid); after != before {
		t.Errorf("updated_at moved from %q to %q", before, after)
	}
}

func TestChangeEmailStoresSpellingAsTyped(t *testing.T) {
	setupTestDB(t)
	uid, _ := registerAndLogin(t, "old@example.com", "password123")

	const typed = "MiXeD.Case+tag@Example.org"
	code, body := changeEmail(t, uid, typed, "password123")
	if code != http.StatusOK {
		t.Fatalf("got %d %v", code, body)
	}
	if got := storedEmail(t, uid); got != typed {
		t.Errorf("stored email = %q, want %q", got, typed)
	}
	data, _ := body["data"].(map[string]any)
	user, _ := data["user"].(map[string]any)
	if user["email"] != typed {
		t.Errorf("returned email = %v, want %q", user["email"], typed)
	}
}

func TestChangeEmailRejectsInvalidInput(t *testing.T) {
	setupTestDB(t)
	uid, _ := registerAndLogin(t, "old@example.com", "password123")

	cases := []struct {
		name, email, password, want string
	}{
		{"empty", "", "password123", "Email is a required field."},
		{"malformed", "not-an-email", "password123", "Email must be a valid email address."},
		{"padded", " padded@example.com ", "password123", "Email must be a valid email address."},
		{"no password", "new@example.com", "", "Current password is a required field."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			code, body := changeEmail(t, uid, tc.email, tc.password)
			msg := errorOf(body)
			if code != http.StatusUnprocessableEntity || !strings.Contains(msg, tc.want) {
				t.Fatalf("got %d %q, want 422 containing %q", code, msg, tc.want)
			}
			for _, leak := range []string{"Key:", "tag", "ChangeEmailRequest"} {
				if strings.Contains(msg, leak) {
					t.Errorf("message %q leaks validator text %q", msg, leak)
				}
			}
			if got := storedEmail(t, uid); got != "old@example.com" {
				t.Errorf("stored email = %q, want unchanged", got)
			}
		})
	}
}

func TestChangeEmailForADeletedAccount(t *testing.T) {
	setupTestDB(t)
	code, body := changeEmail(t, 9999, "new@example.com", "password123")
	if code != http.StatusUnauthorized || errorOf(body) != "That account no longer exists." {
		t.Fatalf("got %d %v", code, body)
	}
}

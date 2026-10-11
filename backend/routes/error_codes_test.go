package routes

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/utils"
)

// These pin the wire contract of the error codes through the real router: the unchanged
// English sentence, the stable code, and the status, together.

func wantError(t *testing.T, name string, gotStatus int, body map[string]any, status int, code, sentence string) {
	t.Helper()
	if gotStatus != status || body["code"] != code || body["error"] != sentence {
		t.Errorf("%s = %d %v, want %d %s %q", name, gotStatus, body, status, code, sentence)
	}
}

func TestPasswordChangeErrorsCarryCodes(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("codes@example.com")
	change := func(current, next string) (int, map[string]any) {
		return a.do("PUT", "/api/v1/me/password", access, map[string]string{"current_password": current, "new_password": next})
	}

	code, body := change("not-my-password", "a-new-password-9")
	wantError(t, "wrong current", code, body, 401, "WRONG_CURRENT_PASSWORD", "Your current password is incorrect.")

	code, body = change("password123", strings.Repeat("a", utils.MaxPasswordBytes+1))
	wantError(t, "change too long", code, body, 400, "PASSWORD_TOO_LONG", utils.CodePasswordTooLong.Message(nil))

	code, body = change("password123", "password123")
	wantError(t, "unchanged", code, body, 400, "PASSWORD_UNCHANGED", "Your new password must be different from your current one.")

	code, body = a.do("POST", "/api/v1/auth/register", "", map[string]string{
		"email": "long@example.com", "password": strings.Repeat("a", utils.MaxPasswordBytes+1)})
	wantError(t, "register too long", code, body, 400, "PASSWORD_TOO_LONG", utils.CodePasswordTooLong.Message(nil))
}

func TestStaleTokensAnswerSessionCodes(t *testing.T) {
	a := newAPI(t)
	a.register("stale@example.com")
	oldAccess, oldRefresh := a.login("stale@example.com")

	probe := func(name, access, refresh string, wantCode, sentence string) {
		code, body := a.do("GET", "/api/v1/me", access, nil)
		wantError(t, name+" access", code, body, 401, wantCode, sentence)
		code, body = a.do("POST", "/api/v1/auth/refresh", "", map[string]string{"refresh_token": refresh})
		wantError(t, name+" refresh", code, body, 401, wantCode, sentence)
	}

	if code, body := a.do("PUT", "/api/v1/me/password", oldAccess, map[string]string{
		"current_password": "password123", "new_password": "a-new-password-9"}); code != 200 {
		t.Fatalf("change password = %d %v", code, body)
	}
	probe("after password change", oldAccess, oldRefresh, "SESSION_EXPIRED", "Your session expired. Please sign in again.")

	// Same for an email change, on a fresh session.
	a.register("stale2@example.com")
	access2, refresh2 := a.login("stale2@example.com")
	if code, body := a.do("PUT", "/api/v1/me/email", access2, map[string]string{
		"email": "moved@example.com", "current_password": "password123"}); code != 200 {
		t.Fatalf("change email = %d %v", code, body)
	}
	probe("after email change", access2, refresh2, "SESSION_EXPIRED", "Your session expired. Please sign in again.")
}

func TestDeletedAccountAnswersSessionInvalid(t *testing.T) {
	a := newAPI(t)
	access, refresh := a.register("deleted@example.com")
	if code, body := a.do("DELETE", "/api/v1/me", access, nil); code != 200 {
		t.Fatalf("delete = %d %v", code, body)
	}
	sentence := "Your session isn't valid. Please sign in again."
	code, body := a.do("POST", "/api/v1/auth/refresh", "", map[string]string{"refresh_token": refresh})
	wantError(t, "refresh", code, body, 401, "SESSION_INVALID", sentence)
	code, body = a.do("GET", "/api/v1/me", access, nil)
	wantError(t, "access", code, body, 401, "SESSION_INVALID", sentence)
}

func TestAuthMiddlewareCodes(t *testing.T) {
	a := newAPI(t)
	_, refresh := a.register("mw@example.com")
	for _, tc := range []struct {
		name, token, code, sentence string
	}{
		{"no token", "", "SIGN_IN_REQUIRED", "You need to sign in to do that."},
		{"garbage", "garbage", "SESSION_INVALID", "Your session isn't valid. Please sign in again."},
		{"refresh as access", refresh, "WRONG_TOKEN_TYPE", "That token can't be used here."},
	} {
		code, body := a.do("GET", "/api/v1/me", tc.token, nil)
		wantError(t, tc.name, code, body, 401, tc.code, tc.sentence)
	}
}

func TestRegisterAndLoginErrorsCarryCodes(t *testing.T) {
	a := newAPI(t)
	a.register("dup@example.com")

	for _, email := range []string{"dup@example.com", "DUP@Example.com"} {
		code, body := a.do("POST", "/api/v1/auth/register", "", map[string]string{"email": email, "password": "password123"})
		wantError(t, "register "+email, code, body, 409, "EMAIL_TAKEN", "That email is already registered.")
	}

	_, wrong := a.do("POST", "/api/v1/auth/login", "", map[string]string{"email": "dup@example.com", "password": "nope-nope-1"})
	_, unknown := a.do("POST", "/api/v1/auth/login", "", map[string]string{"email": "ghost@example.com", "password": "nope-nope-1"})
	for name, body := range map[string]map[string]any{"wrong password": wrong, "unknown email": unknown} {
		wantError(t, name, 401, body, 401, "INVALID_CREDENTIALS", "Invalid email or password.")
		if _, has := body["params"]; has {
			t.Errorf("%s: params present: %v", name, body)
		}
	}
	if len(wrong) != len(unknown) {
		t.Errorf("bodies differ: %v vs %v", wrong, unknown)
	}
}

func TestRegisterValidationFailureCarriesViolations(t *testing.T) {
	a := newAPI(t)
	code, body := a.do("POST", "/api/v1/auth/register", "", map[string]string{"email": "not-an-email", "password": "short"})
	wantError(t, "register", code, body, 422, "VALIDATION_FAILED",
		"Email must be a valid email address. Password must be at least 8 characters in length.")

	params, _ := body["params"].(map[string]any)
	vs, _ := params["violations"].([]any)
	if len(vs) != 2 {
		t.Fatalf("violations = %v, want 2", params)
	}
	want := []struct {
		code, field string
		min         any
	}{{"INVALID_EMAIL", "email", nil}, {"TOO_SHORT", "password", float64(8)}}
	for i, w := range want {
		v, _ := vs[i].(map[string]any)
		p, _ := v["params"].(map[string]any)
		if v["code"] != w.code || p["field"] != w.field || p["min"] != w.min {
			t.Errorf("violation %d = %v, want %+v", i, v, w)
		}
	}
}

func TestUnexpectedDBErrorAnswersInternalError(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("boom@example.com")
	db.DB.Close()
	code, body := a.do("GET", "/api/v1/me", access, nil)
	wantError(t, "closed db", code, body, http.StatusInternalServerError, "INTERNAL_ERROR", "Something went wrong on the server.")
}

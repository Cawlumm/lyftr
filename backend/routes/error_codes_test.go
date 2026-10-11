package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func TestRequestBodyErrorsCarryBindCodes(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("bind@example.com")

	req := httptest.NewRequest("POST", "/api/v1/auth/login", strings.NewReader("{"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	a.r.ServeHTTP(w, req)
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	wantError(t, "login with a truncated body", w.Code, body, 400, "BODY_NOT_JSON", "The request body wasn't valid JSON.")

	code, body := a.do("POST", "/api/v1/workouts", access, map[string]any{
		"name":      "w",
		"exercises": []any{map[string]any{"exercise_id": 1, "sets": []any{map[string]any{"weight": "x"}}}},
	})
	wantError(t, "nested weight", code, body, 400, "NOT_A_NUMBER", "Exercises.sets.weight must be a number.")
	if p, _ := body["params"].(map[string]any); p["field"] != "exercises.sets.weight" {
		t.Errorf("params = %v, want the dotted path", body["params"])
	}

	code, body = a.do("PUT", "/api/v1/active-session", access, map[string]any{})
	wantError(t, "active session without data", code, body, 400, "INVALID_FIELDS", "Data is a required field.")
	params, _ := body["params"].(map[string]any)
	vs, _ := params["violations"].([]any)
	if len(vs) != 1 {
		t.Fatalf("violations = %v", params)
	}
	if v, _ := vs[0].(map[string]any); v["code"] != "REQUIRED" {
		t.Errorf("violation = %v", vs[0])
	}
}

func TestSettingsErrorsCarryCodes(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("settings@example.com")
	put := func(body map[string]any) (int, map[string]any) { return a.do("PUT", "/api/v1/settings", access, body) }

	code, body := put(map[string]any{"weight_unit": "stone"})
	wantError(t, "weight unit", code, body, 400, "INVALID_FIELDS", "Weight unit must be one of: lbs, kg.")
	params, _ := body["params"].(map[string]any)
	vs, _ := params["violations"].([]any)
	if len(vs) != 1 {
		t.Fatalf("violations = %v", params)
	}
	v, _ := vs[0].(map[string]any)
	vp, _ := v["params"].(map[string]any)
	if v["code"] != "NOT_AN_OPTION" || vp["field"] != "weight_unit" || vp["options"] != "lbs, kg" {
		t.Errorf("violation = %v", v)
	}

	code, body = put(map[string]any{"timezone": "Mars/Base"})
	wantError(t, "unknown zone", code, body, 400, "UNKNOWN_TIMEZONE", "Unknown timezone: Mars/Base.")
	if p, _ := body["params"].(map[string]any); p["timezone"] != "Mars/Base" {
		t.Errorf("params = %v", body["params"])
	}

	code, body = put(map[string]any{"timezone": ""})
	wantError(t, "empty zone", code, body, 400, "TIMEZONE_EMPTY", "Timezone can't be empty.")

	code, body = put(map[string]any{"display_name": "a\nb"})
	wantError(t, "control chars", code, body, 400, "DISPLAY_NAME_CONTROL_CHARS", "A name can't contain line breaks or other control characters.")
}

func TestResourceErrorsCarryCodes(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("resources@example.com")

	cases := []struct {
		name, method, path string
		body               any
		status             int
		code, sentence     string
	}{
		{"workout id", "GET", "/workouts/abc", nil, 400, "INVALID_WORKOUT_ID", "That workout id isn't valid."},
		{"workout gone", "GET", "/workouts/999999", nil, 404, "WORKOUT_NOT_FOUND", "That workout no longer exists."},
		{"program id", "GET", "/programs/abc", nil, 400, "INVALID_PROGRAM_ID", "That program id isn't valid."},
		{"program gone", "GET", "/programs/999999", nil, 404, "PROGRAM_NOT_FOUND", "That program no longer exists."},
		{"program unknown exercise", "POST", "/programs", map[string]any{
			"name": "p",
			"days": []any{map[string]any{"name": "d", "exercises": []any{map[string]any{"exercise_id": 999999}}}},
		}, 400, "UNKNOWN_EXERCISES", "One or more of those exercises no longer exist."},
		{"weight from", "GET", "/weight?from=x", nil, 400, "INVALID_FROM_DATE", "From must be in YYYY-MM-DD format."},
		{"weight to", "GET", "/weight?to=x", nil, 400, "INVALID_TO_DATE", "To must be in YYYY-MM-DD format."},
		{"weight gone", "GET", "/weight/999999", nil, 404, "ENTRY_NOT_FOUND", "That entry no longer exists."},
		{"weight id", "GET", "/weight/abc", nil, 400, "INVALID_ID", "That id isn't valid."},
		{"exercise id", "GET", "/exercises/abc", nil, 400, "INVALID_EXERCISE_ID", "That exercise id isn't valid."},
		{"exercise gone", "GET", "/exercises/999999", nil, 404, "EXERCISE_NOT_FOUND", "That exercise no longer exists."},
		{"food date", "GET", "/food?date=x", nil, 400, "INVALID_DATE", "Date must be in YYYY-MM-DD format."},
		{"food id", "GET", "/food/abc", nil, 400, "INVALID_ID", "That id isn't valid."},
		{"food gone", "DELETE", "/food/999999", nil, 404, "ENTRY_NOT_FOUND", "That entry no longer exists."},
		{"saved food gone", "DELETE", "/food/saved/999999", nil, 404, "SAVED_FOOD_NOT_FOUND", "That saved food no longer exists."},
		{"search without a term", "GET", "/food/search", nil, 400, "SEARCH_TERM_REQUIRED", "A search term is required."},
		{"barcode shape", "GET", "/food/barcode/abc", nil, 400, "INVALID_BARCODE", "That barcode isn't valid."},
		{"logged on", "POST", "/food", map[string]any{"name": "Oats", "meal": "lunch", "logged_on": "tomorrow"},
			400, "INVALID_LOGGED_ON", "Logged on must be in YYYY-MM-DD format."},
	}
	for _, tc := range cases {
		code, body := a.do(tc.method, "/api/v1"+tc.path, access, tc.body)
		wantError(t, tc.name, code, body, tc.status, tc.code, tc.sentence)
	}
}

func TestFoodLengthLimitsCarryTheLimit(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("limits@example.com")

	cases := []struct {
		field, code, sentence string
		max, over             int
	}{
		{"brand", "FOOD_BRAND_TOO_LONG", "Brand must be 200 characters or fewer.", 200, 201},
		{"image_url", "IMAGE_URL_TOO_LONG", "Image URL must be 500 characters or fewer.", 500, 501},
	}
	for _, tc := range cases {
		code, body := a.do("POST", "/api/v1/food", access, map[string]any{
			"name": "Oats", "meal": "lunch", tc.field: strings.Repeat("x", tc.over)})
		wantError(t, tc.field, code, body, 400, tc.code, tc.sentence)
		if p, _ := body["params"].(map[string]any); p["max"] != float64(tc.max) {
			t.Errorf("%s params = %v, want max %d as a JSON number", tc.field, body["params"], tc.max)
		}
	}
}

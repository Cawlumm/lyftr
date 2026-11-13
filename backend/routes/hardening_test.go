package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// raw is a.do with control over the socket address and headers, which is what the
// limiter's key depends on.
func (a *api) raw(method, path, remote string, headers map[string]string, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = remote
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	a.r.ServeHTTP(w, req)
	return w
}

const badLogin = `{"email":"nobody@example.com","password":"password123"}`

func TestLoginIsRateLimitedPerAddress(t *testing.T) {
	a := newAPI(t)
	for i := range 10 {
		w := a.raw("POST", "/api/v1/auth/login", "203.0.113.9:4000", nil, strings.Replace(badLogin, "nobody", "u"+string(rune('a'+i)), 1))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d = %d, want 401", i, w.Code)
		}
	}
	w := a.raw("POST", "/api/v1/auth/login", "203.0.113.9:4000", nil, badLogin)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("11th attempt = %d, want 429", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Error("429 carries no Retry-After")
	}
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body["code"] != "RATE_LIMITED" {
		t.Errorf("body = %v", body)
	}

	// Another address is unaffected, and so are the other auth routes' own buckets.
	if w := a.raw("POST", "/api/v1/auth/login", "203.0.113.10:4000", nil, badLogin); w.Code != http.StatusUnauthorized {
		t.Errorf("a different address = %d, want 401", w.Code)
	}
	if w := a.raw("POST", "/api/v1/auth/refresh", "203.0.113.9:4000", nil, `{"refresh_token":"x"}`); w.Code != http.StatusUnauthorized {
		t.Errorf("refresh from the same address = %d, want its own bucket (401)", w.Code)
	}
}

func TestForwardedForCannotChooseTheKeyFromThePublicInternet(t *testing.T) {
	a := newAPI(t)
	for i := range 10 {
		a.raw("POST", "/api/v1/auth/register", "198.51.100.7:1", map[string]string{"X-Forwarded-For": "9.9.9." + string(rune('0'+i))}, `{}`)
	}
	w := a.raw("POST", "/api/v1/auth/register", "198.51.100.7:1", map[string]string{"X-Forwarded-For": "8.8.8.8"}, `{}`)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("rotating X-Forwarded-For from a public peer = %d, want 429", w.Code)
	}
}

func TestForwardedForIsHonouredFromAPrivateProxy(t *testing.T) {
	a := newAPI(t)
	// The bundled nginx connects from a private address and appends the real client.
	proxy := "172.18.0.3:5555"
	for range 10 {
		a.raw("POST", "/api/v1/auth/register", proxy, map[string]string{"X-Forwarded-For": "203.0.113.50"}, `{}`)
	}
	if w := a.raw("POST", "/api/v1/auth/register", proxy, map[string]string{"X-Forwarded-For": "203.0.113.50"}, `{}`); w.Code != http.StatusTooManyRequests {
		t.Errorf("same client behind the proxy = %d, want 429", w.Code)
	}
	if w := a.raw("POST", "/api/v1/auth/register", proxy, map[string]string{"X-Forwarded-For": "203.0.113.51"}, `{}`); w.Code == http.StatusTooManyRequests {
		t.Error("one client's burst throttled a different client behind the same proxy")
	}
}

func TestOversizedBodyIsRefused(t *testing.T) {
	a := newAPI(t)
	big := `{"email":"` + strings.Repeat("a", 2<<20) + `"}`
	w := a.raw("POST", "/api/v1/auth/login", "203.0.113.1:1", nil, big)
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if w.Code != http.StatusRequestEntityTooLarge || body["code"] != "BODY_TOO_LARGE" {
		t.Errorf("2 MB login body = %d %v, want 413 BODY_TOO_LARGE", w.Code, body)
	}

	// Routes with a raised cap accept what the default would refuse.
	access, _ := a.register("big@example.com")
	payload := `{"data":"` + strings.Repeat("a", 2<<20) + `"}`
	req := httptest.NewRequest("PUT", "/api/v1/active-session", bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+access)
	rec := httptest.NewRecorder()
	a.r.ServeHTTP(rec, req)
	if rec.Code == http.StatusRequestEntityTooLarge {
		t.Errorf("active-session snapshot of 2 MB was refused: %s", rec.Body.String())
	}
}

func TestLoginIsRateLimitedPerAccountAcrossAddresses(t *testing.T) {
	a := newAPI(t)
	a.register("victim@example.com")
	guess := `{"email":"Victim@Example.com","password":"wrong-password"}`
	for i := range 5 {
		// A different public address each time, so only the account limit can stop it.
		w := a.raw("POST", "/api/v1/auth/login", "203.0.113."+string(rune('1'+i))+":1", nil, guess)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("guess %d = %d, want 401", i, w.Code)
		}
	}
	w := a.raw("POST", "/api/v1/auth/login", "203.0.113.99:1", nil, guess)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("6th guess = %d (Retry-After %q), want 429 with Retry-After", w.Code, w.Header().Get("Retry-After"))
	}
	// Even the right password waits: otherwise the limit would only slow the wrong guesses.
	good := `{"email":"victim@example.com","password":"password123"}`
	if w := a.raw("POST", "/api/v1/auth/login", "203.0.113.98:1", nil, good); w.Code != http.StatusTooManyRequests {
		t.Errorf("correct password while limited = %d, want 429", w.Code)
	}
	// Other accounts are untouched.
	if w := a.raw("POST", "/api/v1/auth/login", "203.0.113.97:1", nil, badLogin); w.Code != http.StatusUnauthorized {
		t.Errorf("another account = %d, want 401", w.Code)
	}
}

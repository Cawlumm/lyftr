package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/controllers"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/gin-gonic/gin"
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
	for i := range 20 {
		// A different public address each time, so only the account ceiling can stop it.
		w := a.raw("POST", "/api/v1/auth/login", "203.0.113."+strconv.Itoa(i+1)+":1", nil, guess)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("guess %d = %d, want 401", i, w.Code)
		}
	}
	w := a.raw("POST", "/api/v1/auth/login", "203.0.113.99:1", nil, guess)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("21st guess = %d (Retry-After %q), want 429 with Retry-After", w.Code, w.Header().Get("Retry-After"))
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

func TestLoginGuessesFromOneAddressStopAtFive(t *testing.T) {
	a := newAPI(t)
	a.register("pair@example.com")
	guess := `{"email":"pair@example.com","password":"wrong-password"}`
	for i := range 5 {
		if w := a.raw("POST", "/api/v1/auth/login", "203.0.113.5:1", nil, guess); w.Code != http.StatusUnauthorized {
			t.Fatalf("guess %d = %d, want 401", i, w.Code)
		}
	}
	if w := a.raw("POST", "/api/v1/auth/login", "203.0.113.5:1", nil, guess); w.Code != http.StatusTooManyRequests {
		t.Errorf("6th guess from one address = %d, want 429", w.Code)
	}
	// The owner, from their own address, is not held out by it.
	good := `{"email":"pair@example.com","password":"password123"}`
	if w := a.raw("POST", "/api/v1/auth/login", "203.0.113.6:1", nil, good); w.Code != http.StatusOK {
		t.Errorf("owner from another address = %d, want 200", w.Code)
	}
}

func TestSuccessfulLoginsDoNotSpendTheAccountLimit(t *testing.T) {
	a := newAPI(t)
	a.register("busy@example.com")
	good := `{"email":"busy@example.com","password":"password123"}`
	for i := range 60 {
		// Rotating addresses so the route's per-address limit is out of the picture.
		addr := "198.51.100." + strconv.Itoa(i+1) + ":1"
		if w := a.raw("POST", "/api/v1/auth/login", addr, nil, good); w.Code != http.StatusOK {
			t.Fatalf("login %d = %d, want 200", i, w.Code)
		}
	}
}

func TestDemoAccountIsNotLimitedPerAccount(t *testing.T) {
	a := newAPI(t)
	config.C.DemoMode = true
	a.register(config.DemoEmail)
	good := `{"email":"demo@lyftr.local","password":"password123"}`
	for i := range 40 {
		addr := "198.51.100." + strconv.Itoa(i+1) + ":1"
		if w := a.raw("POST", "/api/v1/auth/login", addr, nil, good); w.Code != http.StatusOK {
			t.Fatalf("demo login %d = %d, want 200", i, w.Code)
		}
	}
}

func TestTrustedProxiesEnvNarrowsWhoseForwardedForIsBelieved(t *testing.T) {
	_ = newAPI(t)
	config.C.TrustedProxies = []string{"172.18.0.3/32"}
	r := gin.New()
	Setup(r, controllers.NewHandler(stores.New(db.DB)))
	lan := &api{t: t, r: r}

	// A LAN client that is not the proxy sends its own chain; every request must land in
	// the same bucket however the header is rotated.
	for i := range 10 {
		lan.raw("POST", "/api/v1/auth/register", "192.168.1.20:1", map[string]string{"X-Forwarded-For": "7.7.7." + strconv.Itoa(i) + ", 10.0.0.9"}, `{}`)
	}
	w := lan.raw("POST", "/api/v1/auth/register", "192.168.1.20:1", map[string]string{"X-Forwarded-For": "6.6.6.6, 10.0.0.9"}, `{}`)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("spoofed X-Forwarded-For from an untrusted private peer = %d, want 429", w.Code)
	}
	// The configured proxy is still believed.
	if w := lan.raw("POST", "/api/v1/auth/register", "172.18.0.3:1", map[string]string{"X-Forwarded-For": "203.0.113.77"}, `{}`); w.Code == http.StatusTooManyRequests {
		t.Error("the configured proxy's client was throttled by another peer's bucket")
	}
}

func TestNginxOverwritesForwardedForSoPrivateClientsCannotChainIt(t *testing.T) {
	for _, f := range []string{"../../apps/app/nginx.conf.template", "../../fly/nginx.fly.conf"} {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(b), "$proxy_add_x_forwarded_for") {
			t.Errorf("%s appends to a client-supplied X-Forwarded-For; overwrite it", f)
		}
	}
}

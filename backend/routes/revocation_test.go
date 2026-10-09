package routes

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/controllers"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
)

// These run the real router against a real database, so they prove what a client sees:
// an access token stops working the moment its account is deleted or its session ended,
// instead of lingering until it expires (#194).

type api struct {
	t *testing.T
	r *gin.Engine
}

func newAPI(t *testing.T) *api {
	t.Helper()
	prev := config.C
	config.C = &config.Config{
		Env: "production", CORSOrigin: "http://a.com", Registration: config.RegistrationOpen,
		JWTSecret: "test-secret-test-secret-test-secret-1", JWTExpiry: "3600", Version: "test",
	}
	t.Cleanup(func() { config.C = prev })

	name := fmt.Sprintf("file:revoke_%d?mode=memory&cache=shared&_pragma=foreign_keys(on)", rand.Int63())
	conn, err := sql.Open("sqlite", name)
	if err != nil {
		t.Fatal(err)
	}
	prevDB := db.DB
	db.DB = conn
	if err := db.BuildSchema(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(); db.DB = prevDB })

	gin.SetMode(gin.TestMode)
	r := gin.New()
	Setup(r, controllers.NewHandler(stores.New(conn)))
	return &api{t: t, r: r}
}

func (a *api) do(method, path, token string, body any) (int, map[string]any) {
	a.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			a.t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	a.r.ServeHTTP(w, req)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func data(m map[string]any) map[string]any {
	d, _ := m["data"].(map[string]any)
	return d
}

func (a *api) register(email string) (access, refresh string) {
	a.t.Helper()
	code, body := a.do("POST", "/api/v1/auth/register", "", map[string]string{"email": email, "password": "password123"})
	if code != http.StatusCreated {
		a.t.Fatalf("register %s = %d %v", email, code, body)
	}
	d := data(body)
	return d["token"].(string), d["refresh_token"].(string)
}

func (a *api) login(email string) (access, refresh string) {
	a.t.Helper()
	code, body := a.do("POST", "/api/v1/auth/login", "", map[string]string{"email": email, "password": "password123"})
	if code != http.StatusOK {
		a.t.Fatalf("login %s = %d %v", email, code, body)
	}
	d := data(body)
	return d["token"].(string), d["refresh_token"].(string)
}

func (a *api) status(token string) int {
	code, _ := a.do("GET", "/api/v1/me", token, nil)
	return code
}

func TestADeletedAccountsTokenStopsWorkingAtOnce(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("gone@example.com")
	if a.status(access) != http.StatusOK {
		t.Fatal("a fresh token should work")
	}

	if code, body := a.do("DELETE", "/api/v1/me", access, nil); code != http.StatusOK {
		t.Fatalf("delete = %d %v", code, body)
	}

	for _, probe := range []struct{ method, path string }{
		{"GET", "/api/v1/me"}, {"GET", "/api/v1/weight"}, {"GET", "/api/v1/food"}, {"POST", "/api/v1/weight"},
	} {
		if code, _ := a.do(probe.method, probe.path, access, map[string]any{"weight": 180}); code != http.StatusUnauthorized {
			t.Errorf("%s %s with the deleted account's token = %d, want 401", probe.method, probe.path, code)
		}
	}
}

func TestChangingThePasswordEndsOtherDevicesAtOnce(t *testing.T) {
	a := newAPI(t)
	a.register("pw@example.com")
	thisDevice, _ := a.login("pw@example.com")
	otherDevice, _ := a.login("pw@example.com")

	code, body := a.do("PUT", "/api/v1/me/password", thisDevice, map[string]string{
		"current_password": "password123", "new_password": "a-new-password-9",
	})
	if code != http.StatusOK {
		t.Fatalf("change password = %d %v", code, body)
	}
	fresh := data(body)["token"].(string)

	if got := a.status(otherDevice); got != http.StatusUnauthorized {
		t.Errorf("the other device's token = %d, want 401", got)
	}
	if got := a.status(thisDevice); got != http.StatusUnauthorized {
		t.Errorf("this device's pre-change token = %d, want 401", got)
	}
	if got := a.status(fresh); got != http.StatusOK {
		t.Errorf("the pair handed back = %d, want 200", got)
	}
}

func TestChangingTheEmailEndsOtherDevicesButNotACaseOnlyChange(t *testing.T) {
	a := newAPI(t)
	a.register("mail@example.com")
	thisDevice, _ := a.login("mail@example.com")
	otherDevice, _ := a.login("mail@example.com")

	change := func(token, email string) map[string]any {
		code, body := a.do("PUT", "/api/v1/me/email", token, map[string]string{"email": email, "current_password": "password123"})
		if code != http.StatusOK {
			t.Fatalf("change to %s = %d %v", email, code, body)
		}
		return data(body)
	}

	// Capitalisation alone changes no identity, so nothing ends.
	cased := change(thisDevice, "Mail@example.com")
	if got := a.status(otherDevice); got != http.StatusOK {
		t.Errorf("other device after a case-only change = %d, want 200", got)
	}

	// A real change ends the other device immediately, and keeps the one that made it.
	moved := change(cased["token"].(string), "other@example.com")
	if got := a.status(otherDevice); got != http.StatusUnauthorized {
		t.Errorf("other device after a real change = %d, want 401", got)
	}
	if got := a.status(moved["token"].(string)); got != http.StatusOK {
		t.Errorf("the pair handed back = %d, want 200", got)
	}
}

func TestAnUntouchedAccountsTokenKeepsWorking(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("steady@example.com")
	a.register("someone-else@example.com")
	for i := range 3 {
		if got := a.status(access); got != http.StatusOK {
			t.Fatalf("request %d = %d, want 200", i, got)
		}
	}
}

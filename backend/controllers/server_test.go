package controllers

import (
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
)

func TestServerInfo(t *testing.T) {
	setupTestDB(t)
	config.C.Version = "9.9.9"

	c, w := newContext(0, "GET", "/api/v1/info", nil)
	th.ServerInfo(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	body := decodeResponse(t, w)
	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatalf("missing data envelope: %v", body)
	}
	if data["name"] != "lyftr" {
		t.Errorf("name = %v, want lyftr", data["name"])
	}
	if data["version"] != "9.9.9" {
		t.Errorf("version = %v, want 9.9.9", data["version"])
	}
	if data["registration_open"] != true {
		t.Errorf("registration_open = %v, want true", data["registration_open"])
	}
}

// The flag both clients read to decide whether to offer "Create account". Under
// first-user it has to flip the moment the owner claims the instance — a static value
// per mode would keep advertising an open server that now 403s.
func TestServerInfoReportsRegistrationState(t *testing.T) {
	infoOpen := func(t *testing.T) any {
		t.Helper()
		c, w := newContext(0, "GET", "/api/v1/info", nil)
		th.ServerInfo(c)
		data := decodeResponse(t, w)["data"].(map[string]any)
		return data["registration_open"]
	}

	t.Run("closed", func(t *testing.T) {
		setupTestDB(t)
		setRegistration(t, config.RegistrationClosed)
		if got := infoOpen(t); got != false {
			t.Errorf("registration_open = %v, want false", got)
		}
	})

	t.Run("first-user flips once claimed", func(t *testing.T) {
		setupTestDB(t)
		setRegistration(t, config.RegistrationFirstUser)

		if got := infoOpen(t); got != true {
			t.Fatalf("registration_open on an empty instance = %v, want true", got)
		}
		createTestUser(t)
		if got := infoOpen(t); got != false {
			t.Errorf("registration_open after the first account = %v, want false", got)
		}
	})
}

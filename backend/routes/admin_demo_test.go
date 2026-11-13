package routes

import (
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/seed"
)

func (a *api) wantCode(name string, got int, body map[string]any, status int, code string) {
	a.t.Helper()
	if got != status || body["code"] != code {
		a.t.Errorf("%s = %d %v, want %d %s", name, got, body, status, code)
	}
}

func TestAdminRoutesNeedAnAdmin(t *testing.T) {
	a := newAPI(t)

	code, body := a.do("GET", "/api/v1/admin/seed-status", "", nil)
	a.wantCode("no token", code, body, 401, "SIGN_IN_REQUIRED")

	owner, _ := a.register("owner@example.com")
	other, _ := a.register("other@example.com")

	if code, body := a.do("GET", "/api/v1/admin/seed-status", owner, nil); code != http.StatusOK {
		t.Errorf("the first account on the instance = %d %v, want 200", code, body)
	}
	for _, r := range []struct{ method, path string }{
		{"GET", "/api/v1/admin/seed-status"}, {"POST", "/api/v1/admin/sync-exercises"},
	} {
		code, body := a.do(r.method, r.path, other, nil)
		a.wantCode("ordinary user "+r.method+" "+r.path, code, body, 403, "ADMIN_REQUIRED")
	}

	_, me := a.do("GET", "/api/v1/me", owner, nil)
	if data(me)["is_admin"] != true {
		t.Errorf("owner /me = %v, want is_admin true", me)
	}
	_, me = a.do("GET", "/api/v1/me", other, nil)
	if data(me)["is_admin"] != false {
		t.Errorf("other /me = %v, want is_admin false", me)
	}
}

func TestTheDemoUserIsNeverAnAdmin(t *testing.T) {
	a := newAPI(t)
	config.C.DemoMode = true
	seed.DemoUser(db.DB)

	demo, _ := a.login2("demo@lyftr.local", "password123")
	code, body := a.do("GET", "/api/v1/admin/seed-status", demo, nil)
	a.wantCode("demo user", code, body, 403, "ADMIN_REQUIRED")

	// Registering after the demo account exists promotes the first real user, not the demo.
	real, _ := a.register("real@example.com")
	if code, body := a.do("GET", "/api/v1/admin/seed-status", real, nil); code != http.StatusOK {
		t.Errorf("first real account after the demo = %d %v, want 200", code, body)
	}

	// Even a row someone flipped by hand does not make the demo user an admin.
	if _, err := db.DB.Exec(`UPDATE users SET is_admin = 1 WHERE email = 'demo@lyftr.local'`); err != nil {
		t.Fatal(err)
	}
	code, body = a.do("GET", "/api/v1/admin/seed-status", demo, nil)
	a.wantCode("demo user with the flag forced", code, body, 403, "ADMIN_REQUIRED")
	_, me := a.do("GET", "/api/v1/me", demo, nil)
	if data(me)["is_admin"] != false {
		t.Errorf("demo /me = %v, want is_admin false", me)
	}
}

func (a *api) login2(email, password string) (access, refresh string) {
	a.t.Helper()
	code, body := a.do("POST", "/api/v1/auth/login", "", map[string]string{"email": email, "password": password})
	if code != http.StatusOK {
		a.t.Fatalf("login %s = %d %v", email, code, body)
	}
	d := data(body)
	return d["token"].(string), d["refresh_token"].(string)
}

func TestDemoAccountCannotBeChangedOrDeleted(t *testing.T) {
	a := newAPI(t)
	config.C.DemoMode = true
	seed.DemoUser(db.DB)
	demo, _ := a.login2("demo@lyftr.local", "password123")

	code, body := a.do("PUT", "/api/v1/me/password", demo, map[string]string{"current_password": "password123", "new_password": "a-new-password-9"})
	a.wantCode("change password", code, body, 403, "DEMO_ACCOUNT_PROTECTED")
	code, body = a.do("PUT", "/api/v1/me/email", demo, map[string]string{"current_password": "password123", "email": "mine@example.com"})
	a.wantCode("change email", code, body, 403, "DEMO_ACCOUNT_PROTECTED")
	code, body = a.do("DELETE", "/api/v1/me", demo, nil)
	a.wantCode("delete", code, body, 403, "DEMO_ACCOUNT_PROTECTED")

	// Nothing changed: the same login still works and the account is still there.
	if got := a.status(demo); got != http.StatusOK {
		t.Errorf("demo session after the refused changes = %d, want 200", got)
	}
	a.login2("demo@lyftr.local", "password123")
}

func TestDemoProtectionIsOffWhenDemoModeIsOff(t *testing.T) {
	// A leftover account at the demo address on an instance that no longer seeds it is
	// just an account: its owner may have changed the password and must be able to.
	a := newAPI(t)
	if code, body := a.do("POST", "/api/v1/auth/register", "", map[string]string{"email": "demo@lyftr.local", "password": "password123"}); code != http.StatusCreated {
		t.Fatalf("register = %d %v", code, body)
	}
	demo, _ := a.login2("demo@lyftr.local", "password123")
	if code, body := a.do("PUT", "/api/v1/me/password", demo, map[string]string{"current_password": "password123", "new_password": "a-new-password-9"}); code != http.StatusOK {
		t.Errorf("change password with DEMO_MODE off = %d %v, want 200", code, body)
	}
}

package routes

import (
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/utils"
)

func (a *api) refresh(token string) (int, map[string]any) {
	a.t.Helper()
	return a.do("POST", "/api/v1/auth/refresh", "", map[string]string{"refresh_token": token})
}

func (a *api) rotate(token string) (access, refresh string) {
	a.t.Helper()
	code, body := a.refresh(token)
	if code != http.StatusOK {
		a.t.Fatalf("refresh = %d %v", code, body)
	}
	d := data(body)
	return d["token"].(string), d["refresh_token"].(string)
}

func trackedRefreshTokens(t *testing.T) int {
	t.Helper()
	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM refresh_tokens`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestRefreshRotatesAndTheNewTokenWorks(t *testing.T) {
	a := newAPI(t)
	_, first := a.register("rot@example.com")
	if trackedRefreshTokens(t) != 1 {
		t.Fatalf("registration should record its refresh token, have %d", trackedRefreshTokens(t))
	}

	access, second := a.rotate(first)
	if second == first {
		t.Fatal("refresh returned the same refresh token")
	}
	if a.status(access) != http.StatusOK {
		t.Error("the new access token does not work")
	}
	third := func() string { _, r := a.rotate(second); return r }()
	if third == second {
		t.Error("the second rotation returned the same token")
	}
}

func TestReplayingARotatedTokenSoonAfterIsServedNotTreatedAsTheft(t *testing.T) {
	// A response lost in flight leaves the client holding the token the server already
	// spent. Retrying it must not sign the person out (CLAUDE.md: silence is not a verdict).
	a := newAPI(t)
	_, first := a.register("retry@example.com")
	a.rotate(first)

	access, _ := a.rotate(first)
	if a.status(access) != http.StatusOK {
		t.Error("a retry inside the grace window should yield a working session")
	}
}

func TestReusingARotatedTokenLongAfterRevokesTheSessions(t *testing.T) {
	a := newAPI(t)
	a.register("thief@example.com")
	access, stolen := a.login("thief@example.com")
	_, current := a.rotate(stolen) // the owner refreshes; the thief still holds `stolen`

	// Past the grace window.
	if _, err := db.DB.Exec(`UPDATE refresh_tokens SET used_at = used_at - 3600 WHERE used_at IS NOT NULL`); err != nil {
		t.Fatal(err)
	}

	code, body := a.refresh(stolen)
	a.wantCode("stale token", code, body, 401, "SESSION_EXPIRED")

	// Everything the account held is gone: the owner's newest token and the access token.
	code, body = a.refresh(current)
	a.wantCode("the owner's newest token", code, body, 401, "SESSION_EXPIRED")
	if a.status(access) != http.StatusUnauthorized {
		t.Error("an access token issued before the reuse still works")
	}

	// Signing in again is the way back.
	if newAccess, _ := a.login("thief@example.com"); a.status(newAccess) != http.StatusOK {
		t.Error("a fresh login after the revocation does not work")
	}
}

func TestLogoutRevokesTheRefreshToken(t *testing.T) {
	a := newAPI(t)
	a.register("bye@example.com")
	_, thisDevice := a.login("bye@example.com")
	_, otherDevice := a.login("bye@example.com")

	code, body := a.do("POST", "/api/v1/auth/logout", "", map[string]string{"refresh_token": thisDevice})
	if code != http.StatusOK {
		t.Fatalf("logout = %d %v", code, body)
	}

	code, body = a.refresh(thisDevice)
	a.wantCode("refresh after logout", code, body, 401, "SESSION_INVALID")
	if code, _ := a.refresh(otherDevice); code != http.StatusOK {
		t.Errorf("another device's refresh token = %d, want 200: logout must end only its own session", code)
	}
}

func TestLogoutIsIdempotentAndTellsAProberNothing(t *testing.T) {
	a := newAPI(t)
	_, refresh := a.register("idem@example.com")
	for _, tok := range []string{refresh, refresh, "garbage", ""} {
		code, body := a.do("POST", "/api/v1/auth/logout", "", map[string]string{"refresh_token": tok})
		if tok == "" {
			if code != http.StatusBadRequest && code != http.StatusUnprocessableEntity {
				t.Errorf("logout with an empty token = %d %v", code, body)
			}
			continue
		}
		if code != http.StatusOK {
			t.Errorf("logout(%.8q) = %d %v, want 200", tok, code, body)
		}
	}
	// An access token is not a refresh token and revokes nothing.
	_, refresh2 := a.register("idem2@example.com")
	access, _ := a.login("idem2@example.com")
	a.do("POST", "/api/v1/auth/logout", "", map[string]string{"refresh_token": access})
	if code, _ := a.refresh(refresh2); code != http.StatusOK {
		t.Errorf("refresh after a logout that presented an access token = %d, want 200", code)
	}
}

func TestATokenWithoutAJtiStillRefreshesAndIsUpgraded(t *testing.T) {
	// What every client that signed in before this change holds.
	a := newAPI(t)
	a.register("legacy@example.com")
	var uid int64
	if err := db.DB.QueryRow(`SELECT id FROM users WHERE email = 'legacy@example.com'`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	_, legacy, err := utils.GenerateTokenPair(uid, "legacy@example.com", 1)
	if err != nil {
		t.Fatal(err)
	}
	before := trackedRefreshTokens(t)

	access, upgraded := a.rotate(legacy)
	if a.status(access) != http.StatusOK {
		t.Error("the access token from a legacy refresh does not work")
	}
	if trackedRefreshTokens(t) != before+1 {
		t.Error("the replacement refresh token is not tracked")
	}
	a.rotate(upgraded) // and the upgraded one rotates normally
}

func TestDeletingTheAccountDropsItsRefreshTokens(t *testing.T) {
	a := newAPI(t)
	access, _ := a.register("gone2@example.com")
	if code, body := a.do("DELETE", "/api/v1/me", access, map[string]string{"current_password": "password123"}); code != http.StatusOK {
		t.Fatalf("delete = %d %v", code, body)
	}
	if n := trackedRefreshTokens(t); n != 0 {
		t.Errorf("refresh_tokens rows left after account delete = %d, want 0 (cascade)", n)
	}
}

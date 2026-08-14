package controllers

import (
	"errors"
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
)

func registerRequest(t *testing.T, email string) int {
	t.Helper()
	c, w := newContext(0, "POST", "/api/v1/auth/register",
		map[string]string{"email": email, "password": "password123"})
	th.Register(c)
	return w.Code
}

func userCount(t *testing.T) int {
	t.Helper()
	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		t.Fatalf("count users: %v", err)
	}
	return n
}

func TestRegisterOpenCreatesAccounts(t *testing.T) {
	setupTestDB(t)
	setRegistration(t, config.RegistrationOpen)

	if code := registerRequest(t, "first@example.com"); code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", code)
	}
	// Open means open: a second, unrelated person may still sign up.
	if code := registerRequest(t, "second@example.com"); code != http.StatusCreated {
		t.Fatalf("second register status = %d, want 201", code)
	}
	if n := userCount(t); n != 2 {
		t.Errorf("user count = %d, want 2", n)
	}
}

func TestRegisterClosedRejectsAndWritesNothing(t *testing.T) {
	setupTestDB(t)
	setRegistration(t, config.RegistrationClosed)

	c, w := newContext(0, "POST", "/api/v1/auth/register",
		map[string]string{"email": "someone@example.com", "password": "password123"})
	th.Register(c)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", w.Code)
	}
	body := decodeResponse(t, w)
	if body["error"] != RegistrationClosedMessage {
		t.Errorf("error = %v, want %q", body["error"], RegistrationClosedMessage)
	}
	// The rejection must happen before the insert, not merely be reported after one.
	if n := userCount(t); n != 0 {
		t.Errorf("user count = %d, want 0 — a closed instance created an account", n)
	}
}

// A closed instance must not answer differently for a malformed body than for a valid
// one: the reject comes first, so probing register with junk cannot be used to tell a
// closed Lyftr from one that is merely rejecting the payload.
func TestRegisterClosedRejectsBeforeReadingTheBody(t *testing.T) {
	setupTestDB(t)
	setRegistration(t, config.RegistrationClosed)

	c, w := newContext(0, "POST", "/api/v1/auth/register", map[string]string{"email": "not-an-email"})
	th.Register(c)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (got the validation error instead)", w.Code)
	}
}

func TestRegisterFirstUserOpensOnceThenCloses(t *testing.T) {
	setupTestDB(t)
	setRegistration(t, config.RegistrationFirstUser)

	if code := registerRequest(t, "owner@example.com"); code != http.StatusCreated {
		t.Fatalf("owner register status = %d, want 201", code)
	}

	c, w := newContext(0, "POST", "/api/v1/auth/register",
		map[string]string{"email": "scraper@example.com", "password": "password123"})
	th.Register(c)

	if w.Code != http.StatusForbidden {
		t.Fatalf("second register status = %d, want 403", w.Code)
	}
	// Identical to the closed message: a caller cannot tell first-user from closed.
	if body := decodeResponse(t, w); body["error"] != RegistrationClosedMessage {
		t.Errorf("error = %v, want %q", body["error"], RegistrationClosedMessage)
	}
	if n := userCount(t); n != 1 {
		t.Errorf("user count = %d, want 1", n)
	}
}

// Known gap, stated rather than papered over: nothing here proves Register *picks*
// CreateFirst in first-user mode. Swapping that line back to Create leaves every test
// above green, because the handler's pre-check already covers the sequential path and
// the difference only shows under a genuine interleaving — which cannot be produced
// deterministically through the handler. A concurrent version of this test would pass by
// luck as often as not, which is worse than an honest note.
//
// The handler's pre-check is a fast reject, not the guard. Two requests arriving at a
// fresh instance can both see an empty table and both be waved through — which is the
// exact race first-user exists to prevent — so the count is repeated inside the insert
// transaction. This calls the store directly because the interleaving cannot be produced
// through the handler: it is the state CreateFirst sees, not the order of two HTTP calls.
func TestCreateFirstRefusesOnceTheSlotIsTaken(t *testing.T) {
	setupTestDB(t)

	s := stores.New(db.DB)
	if _, err := s.User.CreateFirst("owner@example.com", "hash"); err != nil {
		t.Fatalf("first CreateFirst: %v", err)
	}

	_, err := s.User.CreateFirst("scraper@example.com", "hash")
	if !errors.Is(err, stores.ErrRegistrationClosed) {
		t.Fatalf("second CreateFirst err = %v, want ErrRegistrationClosed", err)
	}
	if n := userCount(t); n != 1 {
		t.Errorf("user count = %d, want 1 — the race guard let a second account through", n)
	}
}

// A rejected CreateFirst must not leave a half-written account behind: the users insert
// and the user_settings insert share one transaction with the count.
func TestCreateFirstRollsBackCleanly(t *testing.T) {
	setupTestDB(t)

	s := stores.New(db.DB)
	if _, err := s.User.CreateFirst("owner@example.com", "hash"); err != nil {
		t.Fatalf("first CreateFirst: %v", err)
	}
	if _, err := s.User.CreateFirst("scraper@example.com", "hash"); err == nil {
		t.Fatal("expected the second CreateFirst to fail")
	}

	var settings int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM user_settings`).Scan(&settings); err != nil {
		t.Fatalf("count settings: %v", err)
	}
	if settings != 1 {
		t.Errorf("user_settings rows = %d, want 1", settings)
	}
}

func TestUserCount(t *testing.T) {
	setupTestDB(t)
	s := stores.New(db.DB)

	if n, err := s.User.Count(); err != nil || n != 0 {
		t.Fatalf("Count on an empty table = %d (err %v), want 0", n, err)
	}
	createTestUser(t)
	if n, err := s.User.Count(); err != nil || n != 1 {
		t.Errorf("Count = %d (err %v), want 1", n, err)
	}
}

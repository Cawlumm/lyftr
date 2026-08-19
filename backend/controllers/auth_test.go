package controllers

import (
	"errors"
	"net/http"
	"sort"
	"testing"
	"time"

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

// Register used to assemble its response from the request, leaving created_at at Go's
// zero time. That serialises as "0001-01-01T00:00:00Z", which is truthy and parses fine,
// so the clients formatted it rather than rejecting it — a brand new account's Settings
// page read "Member since December 1".
func TestRegisterReturnsRealTimestamps(t *testing.T) {
	setupTestDB(t)
	setRegistration(t, config.RegistrationOpen)

	c, w := newContext(0, "POST", "/api/v1/auth/register",
		map[string]string{"email": "timestamps@example.com", "password": "password123"})
	th.Register(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", w.Code)
	}

	body := decodeResponse(t, w)
	data, _ := body["data"].(map[string]any)
	user, _ := data["user"].(map[string]any)
	created, _ := user["created_at"].(string)
	if created == "" {
		t.Fatal("no created_at in the register response")
	}
	ts, err := time.Parse(time.RFC3339, created)
	if err != nil {
		t.Fatalf("created_at %q does not parse: %v", created, err)
	}
	if ts.IsZero() || ts.Year() < 2000 {
		t.Errorf("created_at = %q, want a real timestamp", created)
	}
}

// A sign-in for an address with no account used to return before hashing, while a real
// address paid a full bcrypt round. That is a 12x difference in practice — an oracle for
// which addresses are registered, which is exactly what giving both cases the same
// message is meant to prevent.
//
// Asserted as a ratio rather than an absolute, since bcrypt cost and machine speed both
// move. The bound is loose on purpose: this catches "one path skips bcrypt entirely",
// not micro-variation.
func TestLoginDoesNotLeakAccountExistenceByTiming(t *testing.T) {
	setupTestDB(t)

	const password = "password123"
	c, w := newContext(0, "POST", "/api/v1/auth/register",
		map[string]string{"email": "timing@lyftr.local", "password": password})
	th.Register(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("register status = %d", w.Code)
	}

	attempt := func(email string) time.Duration {
		start := time.Now()
		c, w := newContext(0, "POST", "/api/v1/auth/login",
			map[string]string{"email": email, "password": "definitely-the-wrong-password"})
		th.Login(c)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("login status = %d, want 401", w.Code)
		}
		return time.Since(start)
	}

	// Median of a handful, so one scheduling hiccup cannot decide the result.
	median := func(email string) time.Duration {
		const n = 5
		var xs []time.Duration
		for i := 0; i < n; i++ {
			xs = append(xs, attempt(email))
		}
		sort.Slice(xs, func(i, j int) bool { return xs[i] < xs[j] })
		return xs[n/2]
	}

	existing := median("timing@lyftr.local")
	missing := median("no-such-account@lyftr.local")

	ratio := float64(existing) / float64(missing)
	if ratio > 3 || ratio < 1.0/3 {
		t.Errorf("existing=%v missing=%v (%.1fx apart) — one path is skipping the password comparison",
			existing, missing, ratio)
	}
}

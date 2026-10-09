package middleware

import (
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
)

type fakeVersions struct {
	version int
	err     error
}

func (f fakeVersions) TokenVersion(int64) (int, error) { return f.version, f.err }

func useConfig(t *testing.T) {
	t.Helper()
	prev := config.C
	config.C = &config.Config{JWTSecret: "test-secret-test-secret-test-secret-1", JWTExpiry: "3600"}
	t.Cleanup(func() { config.C = prev })
}

func serve(t *testing.T, v TokenVersions, header string) (*httptest.ResponseRecorder, *bool) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	reached := false
	r := gin.New()
	r.GET("/ping", Auth(v), func(c *gin.Context) {
		reached = true
		c.JSON(http.StatusOK, gin.H{"id": UserID(c)})
	})
	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	if header != "" {
		req.Header.Set("Authorization", header)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w, &reached
}

func pair(t *testing.T, version int) (access, refresh string) {
	t.Helper()
	a, r, err := utils.GenerateTokenPair(7, "a@x.com", version)
	if err != nil {
		t.Fatal(err)
	}
	return a, r
}

func TestAuthAcceptsATokenAtTheCurrentVersion(t *testing.T) {
	useConfig(t)
	access, _ := pair(t, 3)
	w, reached := serve(t, fakeVersions{version: 3}, "Bearer "+access)
	if w.Code != http.StatusOK || !*reached {
		t.Fatalf("status = %d reached = %v, want 200 and reached", w.Code, *reached)
	}
}

func TestAuthRejectsATokenFromAnEarlierVersion(t *testing.T) {
	useConfig(t)
	access, _ := pair(t, 2)
	w, reached := serve(t, fakeVersions{version: 3}, "Bearer "+access)
	if w.Code != http.StatusUnauthorized || *reached {
		t.Fatalf("status = %d reached = %v, want 401 and not reached", w.Code, *reached)
	}
}

func TestAuthRejectsADeletedAccount(t *testing.T) {
	useConfig(t)
	access, _ := pair(t, 1)
	w, reached := serve(t, fakeVersions{err: sql.ErrNoRows}, "Bearer "+access)
	if w.Code != http.StatusUnauthorized || *reached {
		t.Fatalf("status = %d reached = %v, want 401 and not reached", w.Code, *reached)
	}
}

func TestAuthAnswers500WhenTheLookupFails(t *testing.T) {
	useConfig(t)
	access, _ := pair(t, 1)
	w, reached := serve(t, fakeVersions{err: errors.New("disk I/O error")}, "Bearer "+access)
	if w.Code != http.StatusInternalServerError || *reached {
		t.Fatalf("status = %d reached = %v, want 500 and not reached", w.Code, *reached)
	}
}

// busyErr returns a real modernc SQLITE_BUSY error by writing from a second connection
// while a write lock is held on the first, the same way utils' own tests do.
func busyErr(t *testing.T) error {
	t.Helper()
	path := t.TempDir() + "/busy.db"
	a, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(0)")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if _, err := a.Exec(`CREATE TABLE t (id INTEGER PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	tx, err := a.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(`INSERT INTO t (id) VALUES (1)`); err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	b, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(0)")
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	_, err = b.Exec(`INSERT INTO t (id) VALUES (2)`)
	if err == nil {
		t.Fatal("expected a busy error")
	}
	return err
}

// A lock is transient: answering 401 would make every client refresh and then sign the user
// out over a moment's contention, so it has to be a 503 the clients already retry.
func TestAuthAnswers503WhenTheDatabaseIsLocked(t *testing.T) {
	useConfig(t)
	access, _ := pair(t, 1)
	w, reached := serve(t, fakeVersions{err: busyErr(t)}, "Bearer "+access)
	if w.Code != http.StatusServiceUnavailable || *reached {
		t.Fatalf("status = %d reached = %v, want 503 and not reached", w.Code, *reached)
	}
}

// Tokens minted before the version claim existed decode as 0. They stay valid while the
// account is at 1 and end the moment a change moves it on.
func TestAuthTreatsAPreVersionTokenAsVersionOne(t *testing.T) {
	useConfig(t)
	access, _ := pair(t, 0)
	if w, _ := serve(t, fakeVersions{version: 1}, "Bearer "+access); w.Code != http.StatusOK {
		t.Errorf("at version 1 = %d, want 200", w.Code)
	}
	if w, _ := serve(t, fakeVersions{version: 2}, "Bearer "+access); w.Code != http.StatusUnauthorized {
		t.Errorf("at version 2 = %d, want 401", w.Code)
	}
}

func TestAuthRejectsMissingMalformedAndRefreshTokens(t *testing.T) {
	useConfig(t)
	_, refresh := pair(t, 1)
	for name, header := range map[string]string{
		"no header":     "",
		"not a bearer":  "Basic abc",
		"garbage":       "Bearer not-a-token",
		"a refresh one": "Bearer " + refresh,
	} {
		if w, reached := serve(t, fakeVersions{version: 1}, header); w.Code != http.StatusUnauthorized || *reached {
			t.Errorf("%s: status = %d reached = %v, want 401", name, w.Code, *reached)
		}
	}
}

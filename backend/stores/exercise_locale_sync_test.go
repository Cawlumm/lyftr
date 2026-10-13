package stores

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/oedb"
)

// localeCatalog is a fake oedb that answers a by-id list in Spanish and records
// each request, which is how these tests count fetches and check their shape.
type localeCatalog struct {
	srv     *httptest.Server
	mu      sync.Mutex
	queries []map[string]string
	fail    atomic.Bool
}

func newLocaleCatalog(t *testing.T) *localeCatalog {
	t.Helper()
	c := &localeCatalog{}
	c.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		c.mu.Lock()
		c.queries = append(c.queries, map[string]string{"locale": q.Get("locale"), "ids": q.Get("ids")})
		c.mu.Unlock()
		if c.fail.Load() {
			http.Error(w, "down", http.StatusInternalServerError)
			return
		}
		var items []oedb.Exercise
		for _, id := range strings.Split(q.Get("ids"), ",") {
			items = append(items, served(id, "ES "+id, "es", []string{"Uno.", "Dos."}, "es"))
		}
		_ = json.NewEncoder(w).Encode(oedb.ListResult{Exercises: items, Total: len(items)})
	}))
	t.Cleanup(c.srv.Close)
	return c
}

func (c *localeCatalog) requests() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.queries)
}

func holdEnglish(t *testing.T, s *ExerciseStore, n int) {
	t.Helper()
	items := make([]oedb.Exercise, n)
	for i := range items {
		items[i] = catalogExercise(fmt.Sprintf("uuid-%03d", i), fmt.Sprintf("Exercise %03d", i))
	}
	materialize(t, s, "en", items...)
}

func TestSyncLocale_FillsEveryHeldRowInBatches(t *testing.T) {
	cat := newLocaleCatalog(t)
	conn := testDB(t)
	s := NewExerciseStore(conn)
	s.UseCatalog(oedb.New(cat.srv.URL, "test"))
	holdEnglish(t, s, 250)

	fetched, err := s.syncLocaleNow(t.Context(), "es")
	if err != nil || !fetched {
		t.Fatalf("syncLocaleNow = %v, %v; want a fetch and no error", fetched, err)
	}
	if got := cat.requests(); got != 3 {
		t.Errorf("requests = %d, want 3 (250 ids at oedb's page size of 100)", got)
	}
	for _, q := range cat.queries {
		if q["locale"] != "es" || len(strings.Split(q["ids"], ",")) > oedb.MaxPerPage {
			t.Errorf("request %+v: want locale=es and at most %d ids", q, oedb.MaxPerPage)
		}
	}
	if got := countRows(t, conn, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'es'`); got != 250 {
		t.Errorf("es translations = %d, want 250", got)
	}
	var id int64
	conn.QueryRow(`SELECT id FROM exercises WHERE oedb_id = 'uuid-007'`).Scan(&id)
	if got := mustGet(t, s, id, "es").Name; got != "ES uuid-007" {
		t.Errorf("Get(es).Name = %q, want the Spanish name", got)
	}
	if got := mustGet(t, s, id, "en").Name; got != "Exercise 007" {
		t.Errorf("Get(en).Name = %q: the English base must be untouched", got)
	}
}

func TestSyncLocale_FreshLanguageIsNotFetchedAgainUntilTheTTL(t *testing.T) {
	cat := newLocaleCatalog(t)
	s := NewExerciseStore(testDB(t))
	s.UseCatalog(oedb.New(cat.srv.URL, "test"))
	holdEnglish(t, s, 5)

	now := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
	s.sync.now = func() time.Time { return now }

	if fetched, _ := s.syncLocaleNow(t.Context(), "es"); !fetched {
		t.Fatal("first pass did not fetch")
	}
	now = now.Add(localeSyncTTL - time.Minute)
	if fetched, _ := s.syncLocaleNow(t.Context(), "es"); fetched {
		t.Error("fetched again before the TTL")
	}
	now = now.Add(2 * time.Minute)
	if fetched, _ := s.syncLocaleNow(t.Context(), "es"); !fetched {
		t.Error("did not refresh after the TTL: upstream corrections would never arrive")
	}
}

func TestSyncLocale_LanguagesAreTrackedSeparately(t *testing.T) {
	cat := newLocaleCatalog(t)
	s := NewExerciseStore(testDB(t))
	s.UseCatalog(oedb.New(cat.srv.URL, "test"))
	holdEnglish(t, s, 3)

	s.syncLocaleNow(t.Context(), "es")
	if fetched, _ := s.syncLocaleNow(t.Context(), "pt"); !fetched {
		t.Error("a second language was treated as already synced")
	}
}

func TestSyncLocale_FailureLeavesTheLanguageUnmarkedAndTheCacheIntact(t *testing.T) {
	cat := newLocaleCatalog(t)
	conn := testDB(t)
	s := NewExerciseStore(conn)
	s.UseCatalog(oedb.New(cat.srv.URL, "test"))
	holdEnglish(t, s, 5)

	cat.fail.Store(true)
	if _, err := s.syncLocaleNow(t.Context(), "es"); err == nil {
		t.Fatal("want the upstream failure reported")
	}
	if got := countRows(t, conn, `SELECT COUNT(*) FROM exercise_locale_sync`); got != 0 {
		t.Errorf("a failed pass marked the language synced (%d rows)", got)
	}
	if got := countRows(t, conn, `SELECT COUNT(*) FROM exercises`); got != 5 {
		t.Errorf("cached exercises = %d, want 5 untouched", got)
	}

	cat.fail.Store(false)
	if fetched, err := s.syncLocaleNow(t.Context(), "es"); err != nil || !fetched {
		t.Errorf("retry = %v, %v; want it to fetch once the catalog is back", fetched, err)
	}
}

func TestSyncLocale_EnglishAndMissingCatalogAreNoOps(t *testing.T) {
	cat := newLocaleCatalog(t)
	s := NewExerciseStore(testDB(t))
	s.SyncLocale("es") // no catalog configured: must not panic
	s.UseCatalog(oedb.New(cat.srv.URL, "test"))
	holdEnglish(t, s, 3)

	for _, locale := range []string{"", "en", "EN", "en-GB", "not a locale"} {
		s.SyncLocale(locale)
	}
	time.Sleep(50 * time.Millisecond)
	if got := cat.requests(); got != 0 {
		t.Errorf("requests = %d for English and malformed tags, want 0", got)
	}
}

func TestLocaleSyncer_OnePassPerLanguageAtATime(t *testing.T) {
	l := newLocaleSyncer()
	if !l.begin("es") || l.begin("es") {
		t.Fatal("a second claim on the same language must be refused")
	}
	if !l.begin("pt") {
		t.Error("another language must not be blocked")
	}
	l.end("es")
	if !l.begin("es") {
		t.Error("the language must be claimable again once the pass ends")
	}
}

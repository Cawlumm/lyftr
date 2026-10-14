package stores

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/oedb"
)

type catalogCall struct{ path, locale, ids string }

// localeCatalog is a fake oedb routed by path. It answers the locale list, the English
// export of every held id and by-id lists in the requested locale, and records each call.
type localeCatalog struct {
	srv *httptest.Server

	mu         sync.Mutex
	calls      []catalogCall
	locales    []string
	held       int
	failPath   map[string]bool
	failLocale map[string]bool
}

func newLocaleCatalog(t *testing.T, held int, locales ...string) *localeCatalog {
	t.Helper()
	c := &localeCatalog{locales: locales, held: held, failPath: map[string]bool{}, failLocale: map[string]bool{}}
	c.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		c.mu.Lock()
		c.calls = append(c.calls, catalogCall{r.URL.Path, q.Get("locale"), q.Get("ids")})
		failed := c.failPath[r.URL.Path] || c.failLocale[q.Get("locale")] && r.URL.Path == "/api/v1/exercises"
		locs := append([]string(nil), c.locales...)
		c.mu.Unlock()
		// Without this oedb.Client serves a repeat from memory and counts lie.
		w.Header().Set("Cache-Control", "max-age=0")
		if failed {
			http.Error(w, "down", http.StatusInternalServerError)
			return
		}
		switch r.URL.Path {
		case "/api/v1/meta/locales":
			type loc struct {
				Code string `json:"code"`
			}
			out := struct {
				Locales []loc `json:"locales"`
				Total   int   `json:"total"`
			}{Total: len(locs)}
			for _, l := range locs {
				out.Locales = append(out.Locales, loc{l})
			}
			_ = json.NewEncoder(w).Encode(out)
		case "/api/v1/exercises/export":
			var items []oedb.Exercise
			for i := 0; i < c.held; i++ {
				items = append(items, catalogExercise(fmt.Sprintf("uuid-%03d", i), fmt.Sprintf("Exercise %03d", i)))
			}
			_ = json.NewEncoder(w).Encode(oedb.ListResult{Exercises: items, Total: len(items)})
		case "/api/v1/exercises":
			loc := q.Get("locale")
			var items []oedb.Exercise
			for _, id := range strings.Split(q.Get("ids"), ",") {
				items = append(items, served(id, loc+" "+id, loc, []string{"Uno.", "Dos."}, loc))
			}
			_ = json.NewEncoder(w).Encode(oedb.ListResult{Exercises: items, Total: len(items)})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(c.srv.Close)
	return c
}

func (c *localeCatalog) snapshot() []catalogCall {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]catalogCall(nil), c.calls...)
}

func (c *localeCatalog) count(path, locale string) int {
	n := 0
	for _, call := range c.snapshot() {
		if call.path == path && (locale == "" || call.locale == locale) {
			n++
		}
	}
	return n
}

func (c *localeCatalog) listCount(locale string) int { return c.count("/api/v1/exercises", locale) }

func (c *localeCatalog) localeRequests() int { return c.count("/api/v1/meta/locales", "") }

func (c *localeCatalog) setFail(path string, locale string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if path != "" {
		c.failPath[path] = true
	}
	if locale != "" {
		c.failLocale[locale] = true
	}
}

func holdEnglish(t *testing.T, s *ExerciseStore, n int) {
	t.Helper()
	items := make([]oedb.Exercise, n)
	for i := range items {
		items[i] = catalogExercise(fmt.Sprintf("uuid-%03d", i), fmt.Sprintf("Exercise %03d", i))
	}
	materialize(t, s, "en", items...)
}

func syncStore(t *testing.T, held int, locales ...string) (*ExerciseStore, *localeCatalog) {
	t.Helper()
	cat := newLocaleCatalog(t, held, locales...)
	s := NewExerciseStore(testDB(t))
	s.UseCatalog(oedb.New(cat.srv.URL, "test"))
	holdEnglish(t, s, held)
	return s, cat
}

func localID(t *testing.T, s *ExerciseStore, oedbID string) int64 {
	t.Helper()
	var id int64
	if err := s.db.QueryRow(`SELECT id FROM exercises WHERE oedb_id = ?`, oedbID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestRefresh_FillsEveryHeldRowInBatches(t *testing.T) {
	s, cat := syncStore(t, 250)

	if _, err := s.refresh(t.Context(), "es"); err != nil {
		t.Fatal(err)
	}
	if got := cat.listCount("es"); got != 3 {
		t.Errorf("requests = %d, want 3 (250 ids at oedb's page size of 100)", got)
	}
	for _, c := range cat.snapshot() {
		if c.locale != "es" || len(strings.Split(c.ids, ",")) > oedb.MaxPerPage {
			t.Errorf("request %+v: want locale=es and at most %d ids", c, oedb.MaxPerPage)
		}
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'es'`); got != 250 {
		t.Errorf("es translations = %d, want 250", got)
	}
	id := localID(t, s, "uuid-007")
	if got := mustGet(t, s, id, "es").Name; got != "es uuid-007" {
		t.Errorf("Get(es).Name = %q, want the Spanish name", got)
	}
	if got := mustGet(t, s, id, "en").Name; got != "Exercise 007" {
		t.Errorf("Get(en).Name = %q: the English base must be untouched", got)
	}
}

func TestSyncCatalog_SyncsEveryLanguageTheCatalogLists(t *testing.T) {
	s, cat := syncStore(t, 5, "en", "es", "pt")

	if err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := cat.count("/api/v1/exercises/export", ""); got != 1 {
		t.Errorf("export requests = %d, want 1", got)
	}
	if cat.listCount("es") != 1 || cat.listCount("pt") != 1 {
		t.Errorf("list requests es=%d pt=%d, want 1 each", cat.listCount("es"), cat.listCount("pt"))
	}
	for _, l := range []string{"es", "pt"} {
		if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = ?`, l); got != 5 {
			t.Errorf("%s translations = %d, want 5", l, got)
		}
	}
	if got := mustGet(t, s, localID(t, s, "uuid-002"), "pt").Name; got != "pt uuid-002" {
		t.Errorf("Get(pt).Name = %q, want the Portuguese name", got)
	}
}

func TestSyncCatalog_RegionalBeforeBase(t *testing.T) {
	s, cat := syncStore(t, 3, "en", "es", "es-MX")

	if err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	id := localID(t, s, "uuid-001")
	if got := mustGet(t, s, id, "es").Name; got != "es uuid-001" {
		t.Errorf("Get(es).Name = %q, want the es name", got)
	}
	if got := mustGet(t, s, id, "es-MX").Name; got != "es-MX uuid-001" {
		t.Errorf("Get(es-MX).Name = %q, want the es-MX name", got)
	}
	if got := mustGet(t, s, id, "en").Name; got != "Exercise 001" {
		t.Errorf("Get(en).Name = %q, want English", got)
	}
	var order []string
	for _, c := range cat.snapshot() {
		if c.path == "/api/v1/exercises" {
			order = append(order, c.locale)
		}
	}
	if len(order) < 2 || order[0] != "es-MX" || order[len(order)-1] != "es" {
		t.Errorf("list order = %v, want es-MX before es", order)
	}
}

func TestSyncCatalog_NormalizesAndDedupesDiscoveredCodes(t *testing.T) {
	s, cat := syncStore(t, 3, "EN", "es", "ES", "bad tag!")

	if err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := cat.count("/api/v1/exercises/export", ""); got != 1 {
		t.Errorf("export requests = %d, want 1", got)
	}
	if got := cat.listCount("es"); got != 1 {
		t.Errorf("es list requests = %d, want 1", got)
	}
	for _, c := range cat.snapshot() {
		if strings.Contains(c.locale, "bad") {
			t.Errorf("sent locale %q upstream", c.locale)
		}
	}
}

func TestSyncCatalog_DiscoveryFailureSyncsNothing(t *testing.T) {
	s, cat := syncStore(t, 3, "en", "es")
	cat.setFail("/api/v1/meta/locales", "")

	if err := s.syncCatalog(t.Context()); err == nil {
		t.Fatal("want the discovery failure reported")
	}
	if got := cat.listCount(""); got != 0 {
		t.Errorf("list requests = %d, want 0", got)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale <> 'en'`); got != 0 {
		t.Errorf("non-English translations = %d, want 0", got)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises`); got != 3 {
		t.Errorf("exercises = %d, want 3 untouched", got)
	}
}

func TestSyncCatalog_OneLanguageFailingDoesNotStopTheRest(t *testing.T) {
	s, cat := syncStore(t, 4, "en", "es", "pt")
	cat.setFail("", "es")

	if err := s.syncCatalog(t.Context()); err == nil {
		t.Fatal("want the failed language reported so the loop retries sooner")
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'pt'`); got != 4 {
		t.Errorf("pt translations = %d, want 4", got)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'es'`); got != 0 {
		t.Errorf("es translations = %d, want 0", got)
	}
}

func TestSyncCatalog_EmptyCacheRequestsOnlyLocales(t *testing.T) {
	s, cat := syncStore(t, 0, "en", "es")

	if err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := len(cat.snapshot()); got != 1 || cat.localeRequests() != 1 {
		t.Errorf("calls = %+v, want only the locales request", cat.snapshot())
	}
}

func TestRunCatalogSync_RunsAtStartAndRepeatsUntilCancelled(t *testing.T) {
	s, cat := syncStore(t, 2, "en")

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	done := make(chan struct{})
	go func() {
		s.RunCatalogSync(ctx, 10*time.Millisecond)
		close(done)
	}()
	waitFor(t, func() bool { return cat.localeRequests() >= 2 })
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("RunCatalogSync did not return after cancel")
	}
}

func TestRunCatalogSync_WithoutCatalogReturnsImmediately(t *testing.T) {
	s := NewExerciseStore(testDB(t))
	done := make(chan struct{})
	go func() {
		s.RunCatalogSync(t.Context(), time.Hour)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("RunCatalogSync blocked with no catalog")
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not reached in time")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestRetryDelay_StepsUpThenHoldsAndNeverExceedsTheInterval(t *testing.T) {
	cases := []struct {
		failures int
		every    time.Duration
		want     time.Duration
	}{
		{0, CatalogSyncInterval, time.Minute},
		{1, CatalogSyncInterval, 5 * time.Minute},
		{2, CatalogSyncInterval, 30 * time.Minute},
		{9, CatalogSyncInterval, 30 * time.Minute},
		{0, 10 * time.Second, 10 * time.Second},
	}
	for _, c := range cases {
		if got := retryDelay(c.failures, c.every); got != c.want {
			t.Errorf("retryDelay(%d, %s) = %s, want %s", c.failures, c.every, got, c.want)
		}
	}
}

func TestRunCatalogSync_RetriesSoonAfterAFailedLanguageNotAfterTheFullInterval(t *testing.T) {
	old := catalogRetryBackoff
	catalogRetryBackoff = []time.Duration{5 * time.Millisecond}
	t.Cleanup(func() { catalogRetryBackoff = old })

	s, cat := syncStore(t, 2, "en", "es")
	cat.setFail("", "es")

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	go s.RunCatalogSync(ctx, time.Hour)

	// A one-hour interval would never repeat inside the test; only the backoff can.
	waitFor(t, func() bool { return cat.listCount("es") >= 3 })
}

func TestRunCatalogSync_BacksOffToTheFullIntervalOnceAPassIsClean(t *testing.T) {
	old := catalogRetryBackoff
	catalogRetryBackoff = []time.Duration{5 * time.Millisecond}
	t.Cleanup(func() { catalogRetryBackoff = old })

	s, cat := syncStore(t, 2, "en", "es")

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	go s.RunCatalogSync(ctx, time.Hour)

	waitFor(t, func() bool { return cat.localeRequests() >= 1 && cat.listCount("es") >= 1 })
	time.Sleep(100 * time.Millisecond)
	if got := cat.localeRequests(); got != 1 {
		t.Errorf("locale requests = %d after a clean pass, want 1: a clean pass must wait the full interval", got)
	}
}

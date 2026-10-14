package stores

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/oedb"
)

type catalogCall struct {
	path, locale, ids string
	inm               string
	notModified       bool
}

// localeCatalog is a fake oedb routed by path. It answers the locale list, the English
// export of every held id and by-id lists in the requested locale, and records each call.
type localeCatalog struct {
	srv *httptest.Server

	mu         sync.Mutex
	calls      []catalogCall
	locales    []string
	upstream   int
	failPath   map[string]bool
	failLocale map[string]bool
	// exportExtra is appended to the export, for a duplicate-name upstream.
	exportExtra []oedb.Exercise

	// cacheControl is sent on every response; empty means max-age=0.
	cacheControl string
	// rev changes every body and the ETag; 0 keeps names as they were.
	rev int
}

func newLocaleCatalog(t *testing.T, upstream int, locales ...string) *localeCatalog {
	t.Helper()
	c := &localeCatalog{locales: locales, upstream: upstream, failPath: map[string]bool{}, failLocale: map[string]bool{}}
	c.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		c.mu.Lock()
		failed := c.failPath[r.URL.Path] || c.failLocale[q.Get("locale")] && r.URL.Path == "/api/v1/exercises"
		locs := append([]string(nil), c.locales...)
		rev := c.rev
		extra := append([]oedb.Exercise(nil), c.exportExtra...)
		cc := c.cacheControl
		etag := fmt.Sprintf("\"r%d\"", rev)
		inm := r.Header.Get("If-None-Match")
		notModified := !failed && inm == etag
		c.calls = append(c.calls, catalogCall{path: r.URL.Path, locale: q.Get("locale"), ids: q.Get("ids"), inm: inm, notModified: notModified})
		c.mu.Unlock()
		// Without this oedb.Client serves a repeat from memory and counts lie.
		if cc == "" {
			cc = "max-age=0"
		}
		w.Header().Set("Cache-Control", cc)
		if failed {
			http.Error(w, "down", http.StatusInternalServerError)
			return
		}
		w.Header().Set("ETag", etag)
		if notModified {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		suffix := ""
		if rev > 0 {
			suffix = fmt.Sprintf(" r%d", rev)
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
			for i := 0; i < c.upstream; i++ {
				items = append(items, catalogExercise(fmt.Sprintf("uuid-%03d", i), fmt.Sprintf("Exercise %03d", i)+suffix))
			}
			items = append(items, extra...)
			_ = json.NewEncoder(w).Encode(oedb.ListResult{Exercises: items, Total: len(items)})
		case "/api/v1/exercises":
			loc := q.Get("locale")
			var items []oedb.Exercise
			for _, id := range strings.Split(q.Get("ids"), ",") {
				items = append(items, served(id, loc+" "+id+suffix, loc, []string{"Uno.", "Dos."}, loc))
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

func (c *localeCatalog) setCacheControl(v string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cacheControl = v
}

func (c *localeCatalog) setRev(n int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.rev = n
}

func (c *localeCatalog) setLocales(l ...string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.locales = l
}

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

// catalogStore is an empty database wired to a fake catalog serving upstream exercises.
func catalogStore(t *testing.T, upstream int, locales ...string) (*ExerciseStore, *localeCatalog) {
	t.Helper()
	cat := newLocaleCatalog(t, upstream, locales...)
	s := NewExerciseStore(testDB(t))
	s.UseCatalog(oedb.New(cat.srv.URL, "test"))
	return s, cat
}

// syncStore is a catalogStore that already holds every upstream exercise in English.
func syncStore(t *testing.T, held int, locales ...string) (*ExerciseStore, *localeCatalog) {
	t.Helper()
	s, cat := catalogStore(t, held, locales...)
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

	if _, err := s.syncCatalog(t.Context()); err != nil {
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

	if _, err := s.syncCatalog(t.Context()); err != nil {
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

	if _, err := s.syncCatalog(t.Context()); err != nil {
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

	if _, err := s.syncCatalog(t.Context()); err == nil {
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

	if _, err := s.syncCatalog(t.Context()); err == nil {
		t.Fatal("want the failed language reported so the loop retries sooner")
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'pt'`); got != 4 {
		t.Errorf("pt translations = %d, want 4", got)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'es'`); got != 0 {
		t.Errorf("es translations = %d, want 0", got)
	}
}

func TestSyncCatalog_EmptyUpstreamWritesNothing(t *testing.T) {
	s, cat := catalogStore(t, 0, "en", "es")

	n, err := s.syncCatalog(t.Context())
	if err != nil || n != 0 {
		t.Fatalf("syncCatalog = %d, %v, want 0, nil", n, err)
	}
	if cat.localeRequests() != 1 || cat.count("/api/v1/exercises/export", "") != 1 || cat.listCount("") != 0 {
		t.Errorf("calls = %+v, want 1 locales, 1 export, 0 list", cat.snapshot())
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercises"); got != 0 {
		t.Errorf("exercises = %d, want 0", got)
	}
}

func TestSyncCatalog_EmptyDBImportsEveryExerciseAndItsTranslations(t *testing.T) {
	s, cat := catalogStore(t, 250, "en", "es")

	n, err := s.syncCatalog(t.Context())
	if err != nil || n != 250 {
		t.Fatalf("syncCatalog = %d, %v, want 250, nil", n, err)
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercises"); got != 250 {
		t.Errorf("exercises = %d, want 250", got)
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercise_translations WHERE locale = 'es'"); got != 250 {
		t.Errorf("es translations = %d, want 250", got)
	}
	id := localID(t, s, "uuid-007")
	if got := mustGet(t, s, id, "es").Name; got != "es uuid-007" {
		t.Errorf("Get(es).Name = %q, want the es name", got)
	}
	if got := mustGet(t, s, id, "en").Name; got != "Exercise 007" {
		t.Errorf("Get(en).Name = %q, want English", got)
	}
	if cat.localeRequests() != 1 || cat.count("/api/v1/exercises/export", "") != 1 || cat.listCount("es") != 3 {
		t.Errorf("requests: locales=%d export=%d es lists=%d, want 1, 1, 3",
			cat.localeRequests(), cat.count("/api/v1/exercises/export", ""), cat.listCount("es"))
	}
	for _, c := range cat.snapshot() {
		if c.path == "/api/v1/exercises" && len(strings.Split(c.ids, ",")) > oedb.MaxPerPage {
			t.Errorf("list request carried more than %d ids", oedb.MaxPerPage)
		}
	}
}

func TestSyncCatalog_SecondPassIsIdempotent(t *testing.T) {
	s, _ := catalogStore(t, 250, "en", "es")
	ids := func() map[string]int64 {
		m := map[string]int64{}
		rows, err := s.db.Query("SELECT oedb_id, id FROM exercises")
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			var k string
			var v int64
			if err := rows.Scan(&k, &v); err != nil {
				t.Fatal(err)
			}
			m[k] = v
		}
		return m
	}

	n1, err := s.syncCatalog(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	first := ids()
	n2, err := s.syncCatalog(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	second := ids()
	if n1 != 250 || n2 != 250 {
		t.Errorf("recorded = %d then %d, want 250 both times", n1, n2)
	}
	if len(first) != 250 || len(second) != 250 {
		t.Fatalf("rows = %d then %d, want 250", len(first), len(second))
	}
	for k, v := range first {
		if second[k] != v {
			t.Errorf("%s moved from local id %d to %d", k, v, second[k])
		}
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercise_translations WHERE locale = 'es'"); got != 250 {
		t.Errorf("es translations = %d, want 250", got)
	}
}

func TestSyncCatalog_ImportsInTransactionsOfAtMostOnePage(t *testing.T) {
	s, _ := catalogStore(t, 250, "en")
	if _, err := s.db.Exec("CREATE TRIGGER t BEFORE INSERT ON exercises WHEN NEW.oedb_id = 'uuid-150' BEGIN SELECT RAISE(ABORT, 'boom'); END"); err != nil {
		t.Fatal(err)
	}

	_, err := s.syncCatalog(t.Context())
	if err == nil || errors.Is(err, ErrCatalogUnreachable) {
		t.Fatalf("err = %v, want a database error, not ErrCatalogUnreachable", err)
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercises"); got != 100 {
		t.Errorf("exercises = %d, want exactly the first committed chunk of 100", got)
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-099'"); got != 1 {
		t.Errorf("uuid-099 missing: the first chunk must have committed")
	}

	if _, err := s.db.Exec("DROP TRIGGER t"); err != nil {
		t.Fatal(err)
	}
	n, err := s.syncCatalog(t.Context())
	if err != nil || n != 250 {
		t.Fatalf("retry = %d, %v, want 250, nil", n, err)
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercises"); got != 250 {
		t.Errorf("exercises = %d after retry, want 250", got)
	}
}

func TestSyncCatalog_FailedLanguageKeepsImportedRowsAndReportsUnreachable(t *testing.T) {
	s, cat := catalogStore(t, 5, "en", "es")
	cat.setFail("", "es")

	n, err := s.syncCatalog(t.Context())
	if !errors.Is(err, ErrCatalogUnreachable) {
		t.Fatalf("err = %v, want ErrCatalogUnreachable", err)
	}
	if n != 5 {
		t.Errorf("recorded = %d, want 5", n)
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercises"); got != 5 {
		t.Errorf("exercises = %d, want the 5 English rows kept", got)
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercise_translations WHERE locale = 'es'"); got != 0 {
		t.Errorf("es translations = %d, want 0", got)
	}
}

func TestSyncCatalog_BulkImportSkipsADuplicateUpstreamName(t *testing.T) {
	s, cat := catalogStore(t, 2, "en", "es")
	cat.exportExtra = []oedb.Exercise{catalogExercise("uuid-dup", "Exercise 000")}

	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	first := localID(t, s, "uuid-000")
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercises"); got != 2 {
		t.Errorf("exercises = %d, want 2", got)
	}
	if got := countRows(t, s.db, "SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-dup'"); got != 0 {
		t.Errorf("the duplicate name was imported as its own row")
	}
	if got := localID(t, s, "uuid-000"); got != first {
		t.Errorf("uuid-000 moved from %d to %d", first, got)
	}
	for _, c := range cat.snapshot() {
		if strings.Contains(c.ids, "uuid-dup") {
			t.Errorf("listed the skipped id: %+v", c)
		}
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

const slowCacheControl = "public, max-age=300, stale-while-revalidate=86400"

func TestSyncCatalog_SecondPassAppliesUpstreamChangesInsideTheCacheWindow(t *testing.T) {
	s, cat := syncStore(t, 3, "en", "es")
	cat.setCacheControl(slowCacheControl)

	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	cat.setRev(1)
	cat.setLocales("en", "es", "pt")
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	id := localID(t, s, "uuid-001")
	if got := mustGet(t, s, id, "es").Name; got != "es uuid-001 r1" {
		t.Errorf("Get(es).Name = %q, want the second pass's name", got)
	}
	if got := mustGet(t, s, id, "en").Name; got != "Exercise 001 r1" {
		t.Errorf("Get(en).Name = %q, want the second pass's name", got)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'pt'`); got != 3 {
		t.Errorf("pt translations = %d, want 3 from the newly listed locale", got)
	}
}

func TestSyncCatalog_UnchangedUpstreamIsRevalidatedWithout304Bodies(t *testing.T) {
	s, cat := syncStore(t, 3, "en", "es")
	cat.setCacheControl(slowCacheControl)

	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE exercise_translations SET name = 'tampered' WHERE locale = 'es'`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE exercises SET name = 'tampered ' || oedb_id`); err != nil {
		t.Fatal(err)
	}
	before := len(cat.snapshot())
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	second := cat.snapshot()[before:]
	if len(second) == 0 {
		t.Fatal("second pass made no requests: it was served from cache")
	}
	for _, c := range second {
		if c.inm != `"r0"` || !c.notModified {
			t.Errorf("call %+v: want a conditional GET answered 304", c)
		}
	}
	id := localID(t, s, "uuid-001")
	if got := mustGet(t, s, id, "es").Name; got != "es uuid-001" {
		t.Errorf("Get(es).Name = %q, want it restored from the cached body", got)
	}
	if got := mustGet(t, s, id, "en").Name; got != "Exercise 001" {
		t.Errorf("Get(en).Name = %q, want it restored from the cached body", got)
	}
}

func TestSyncCatalog_LocaleDiscoveryHasADeadline(t *testing.T) {
	old := localeSyncTimeout
	localeSyncTimeout = 50 * time.Millisecond
	t.Cleanup(func() { localeSyncTimeout = old })

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	t.Cleanup(srv.Close)
	s := NewExerciseStore(testDB(t))
	s.UseCatalog(oedb.New(srv.URL, "test"))
	holdEnglish(t, s, 2)

	start := time.Now()
	_, err := s.syncCatalog(t.Context())
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want context.DeadlineExceeded", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Errorf("discovery took %s, want it cut off by the deadline", time.Since(start))
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale <> 'en'`); got != 0 {
		t.Errorf("non-English translations = %d, want 0", got)
	}
}

func TestSyncCatalog_RefusesASecondPassWhileOneRuns(t *testing.T) {
	s, cat := syncStore(t, 3, "es")
	before := len(cat.snapshot())
	s.syncing.Store(true)

	_, err := s.syncCatalog(context.Background())
	if !errors.Is(err, ErrSyncRunning) {
		t.Fatalf("err = %v, want ErrSyncRunning", err)
	}
	if n := len(cat.snapshot()) - before; n != 0 {
		t.Errorf("a refused pass made %d upstream requests, want none", n)
	}

	s.syncing.Store(false)
	if _, err := s.syncCatalog(context.Background()); err != nil {
		t.Fatalf("pass after the flag cleared: %v", err)
	}
	if s.syncing.Load() {
		t.Error("the flag was left held after a pass")
	}
}

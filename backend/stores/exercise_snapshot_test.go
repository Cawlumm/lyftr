package stores

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/oedb"
)

// snapHost is a fake snapshot publisher: a manifest plus content-addressed locale files,
// built from the same objects localeCatalog serves so the two sources are equivalent data.
type snapHost struct {
	srv *httptest.Server

	mu      sync.Mutex
	locales map[string][]oedb.Exercise
	gen     time.Time
	// tamper edits the manifest after it is built; files edits a locale's body after hashing.
	tamper  func(m map[string]any)
	files   map[string][]byte
	etag    string
	version int
	hang    bool
	reqs    []string
}

func newSnapHost(t *testing.T, upstream int, locales ...string) *snapHost {
	t.Helper()
	h := &snapHost{locales: map[string][]oedb.Exercise{}, gen: time.Now().UTC().Truncate(time.Second)}
	var en []oedb.Exercise
	for i := 0; i < upstream; i++ {
		en = append(en, catalogExercise(fmt.Sprintf("uuid-%03d", i), fmt.Sprintf("Exercise %03d", i)))
	}
	h.locales["en"] = en
	for _, l := range locales {
		if NormalizeLocale(l) == defaultLocale {
			continue
		}
		var items []oedb.Exercise
		for _, e := range en {
			items = append(items, served(e.ID, l+" "+e.ID, l, []string{"Uno.", "Dos."}, l))
		}
		h.locales[l] = items
	}
	h.publish()
	h.srv = httptest.NewServer(http.HandlerFunc(h.serve))
	t.Cleanup(h.srv.Close)
	return h
}

func (h *snapHost) url() string { return h.srv.URL + "/v1" }

// publish rebuilds files and manifest from h.locales and h.gen.
func (h *snapHost) publish() {
	h.files = map[string][]byte{}
	var ls []map[string]any
	for code, items := range h.locales {
		body, _ := json.Marshal(map[string]any{"exercises": items, "total": len(items)})
		sum := sha256.Sum256(body)
		sh := hex.EncodeToString(sum[:])
		name := "exercises." + code + "." + sh[:16] + ".json"
		h.files["/v1/"+name] = body
		ls = append(ls, map[string]any{"code": code, "file": name, "total": len(items), "sha256": sh})
	}
	m := map[string]any{"schema_version": 1, "generated_at": h.gen.Format(time.RFC3339), "source": "https://api.example", "locales": ls}
	if h.tamper != nil {
		h.tamper(m)
	}
	h.version++
	h.etag = fmt.Sprintf(`"m%d"`, h.version)
	b, _ := json.Marshal(m)
	h.files["/v1/manifest.json"] = b
}

func (h *snapHost) serve(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	hang := h.hang
	h.reqs = append(h.reqs, r.URL.Path)
	body, ok := h.files[r.URL.Path]
	etag := h.etag
	h.mu.Unlock()
	if hang {
		<-r.Context().Done()
		return
	}
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	if r.URL.Path == "/v1/manifest.json" {
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", etag)
	}
	_, _ = w.Write(body)
}

func (h *snapHost) fileRequests() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, p := range h.reqs {
		if p != "/v1/manifest.json" {
			n++
		}
	}
	return n
}

func (h *snapHost) manifestRequests() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, p := range h.reqs {
		if p == "/v1/manifest.json" {
			n++
		}
	}
	return n
}

// snapshotStore is a store wired to an API catalog (counting its requests) and snapshot
// hosts. upstream is the API's English count and what each host publishes.
func snapshotStore(t *testing.T, upstream int, locales []string, hosts ...*snapHost) (*ExerciseStore, *localeCatalog) {
	t.Helper()
	s, cat := catalogStore(t, upstream, locales...)
	var urls []string
	for _, h := range hosts {
		urls = append(urls, h.url())
	}
	s.UseSnapshot(oedb.NewSnapshot(urls, "test"))
	return s, cat
}

func captureLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	return &buf
}

func dumpCatalog(t *testing.T, s *ExerciseStore) string {
	t.Helper()
	var out strings.Builder
	rows, err := s.db.Query(`SELECT oedb_id, name, muscle_group, secondary_muscles, category, equipment, description, image_url, slug, COALESCE(upstream_missing_at, '')
		FROM exercises ORDER BY oedb_id`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var c [10]string
		if err := rows.Scan(&c[0], &c[1], &c[2], &c[3], &c[4], &c[5], &c[6], &c[7], &c[8], &c[9]); err != nil {
			t.Fatal(err)
		}
		fmt.Fprintln(&out, c)
	}
	rows.Close()
	tr, err := s.db.Query(`SELECT e.oedb_id, t.locale, t.name, t.description, t.origin FROM exercise_translations t
		JOIN exercises e ON e.id = t.exercise_id ORDER BY e.oedb_id, t.locale`)
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()
	for tr.Next() {
		var c [5]string
		if err := tr.Scan(&c[0], &c[1], &c[2], &c[3], &c[4]); err != nil {
			t.Fatal(err)
		}
		fmt.Fprintln(&out, c)
	}
	// The two stores read from different test servers; the path is what must agree.
	return strings.ReplaceAll(out.String(), s.catalog.BaseURL(), "<api>")
}

func TestSnapshotPass_NoAPIRequestsAndSameRowsAsAnAPIPass(t *testing.T) {
	host := newSnapHost(t, 5, "en", "es")
	s, cat := snapshotStore(t, 5, []string{"en", "es"}, host)

	n, err := s.syncCatalog(t.Context())
	if err != nil || n != 5 {
		t.Fatalf("syncCatalog = %d, %v", n, err)
	}
	if calls := cat.snapshot(); len(calls) != 0 {
		t.Fatalf("API requests during a snapshot pass: %+v", calls)
	}

	ref, _ := catalogStore(t, 5, "en", "es")
	if _, err := ref.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got, want := dumpCatalog(t, s), dumpCatalog(t, ref); got != want || got == "" {
		t.Errorf("snapshot pass rows differ from the API pass\n%s\nvs\n%s", got, want)
	}

	st, _ := s.CacheStatus()
	if st.CatalogSource == nil || *st.CatalogSource != "snapshot:"+host.url() {
		t.Errorf("catalog_source = %v", st.CatalogSource)
	}
	if st.CatalogGeneratedAt == nil || !st.CatalogGeneratedAt.Equal(host.gen) || st.LastFailed || st.LastSyncedAt == nil {
		t.Errorf("status = %+v", st)
	}
}

func TestSnapshotPass_ImageURLUsesTheAPIBase(t *testing.T) {
	host := newSnapHost(t, 2, "en")
	s, cat := snapshotStore(t, 2, []string{"en"}, host)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	var img string
	if err := s.db.QueryRow(`SELECT image_url FROM exercises WHERE oedb_id = 'uuid-000'`).Scan(&img); err != nil {
		t.Fatal(err)
	}
	if want := cat.srv.URL + "/api/v1/images/img-1"; img != want {
		t.Errorf("image_url = %q, want %q", img, want)
	}
	if strings.Contains(img, host.srv.URL) {
		t.Errorf("image_url %q resolved against the snapshot host", img)
	}
}

func TestSnapshotPass_FailuresFallBackToTheAPI(t *testing.T) {
	old := localeSyncTimeout
	t.Cleanup(func() { localeSyncTimeout = old })

	cases := []struct {
		name   string
		setup  func(h *snapHost)
		reason string
	}{
		{"manifest 404", func(h *snapHost) { delete(h.files, "/v1/manifest.json") }, "http 404"},
		{"timeout", func(h *snapHost) { h.hang = true; localeSyncTimeout = 300 * time.Millisecond }, "deadline"},
		{"schema_version 2", func(h *snapHost) { h.tamper = func(m map[string]any) { m["schema_version"] = 2 } }, "schema_version 2"},
		{"sha mismatch", func(h *snapHost) {
			h.tamper = func(m map[string]any) { m["locales"].([]map[string]any)[0]["sha256"] = strings.Repeat("a", 64) }
		}, "sha256"},
		{"total mismatch", func(h *snapHost) {
			h.tamper = func(m map[string]any) { m["locales"].([]map[string]any)[0]["total"] = 77 }
		}, "manifest says 77"},
		{"duplicate ids", func(h *snapHost) { h.locales["en"] = append(h.locales["en"], h.locales["en"][0]) }, "twice"},
		{"non-en id not in en", func(h *snapHost) {
			h.locales["es"] = append(h.locales["es"], served("uuid-zzz", "x", "es", nil, "es"))
		}, "which en does not"},
		{"stale over 48h", func(h *snapHost) { h.gen = time.Now().Add(-49 * time.Hour) }, "older than 48h"},
		{"bad file name", func(h *snapHost) {
			h.tamper = func(m map[string]any) { m["locales"].([]map[string]any)[0]["file"] = "../evil.json" }
		}, "not safe"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			localeSyncTimeout = old
			host := newSnapHost(t, 4, "en", "es")
			tc.setup(host)
			host.mu.Lock()
			if tc.name != "manifest 404" {
				host.publish()
			}
			host.mu.Unlock()
			buf := captureLog(t)
			s, cat := snapshotStore(t, 4, []string{"en", "es"}, host)

			if _, err := s.syncCatalog(t.Context()); err != nil {
				t.Fatalf("the API fallback should have succeeded: %v", err)
			}
			if got := cat.count("/api/v1/exercises/export", ""); got != 1 {
				t.Errorf("API export requests = %d, want 1", got)
			}
			if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'es'`); got != 4 {
				t.Errorf("es translations = %d, want 4 from the API", got)
			}
			if !strings.Contains(buf.String(), "snapshot not used") || !strings.Contains(buf.String(), tc.reason) {
				t.Errorf("log does not give the reason %q:\n%s", tc.reason, buf.String())
			}
			st, _ := s.CacheStatus()
			if st.CatalogSource == nil || *st.CatalogSource != "api" {
				t.Errorf("catalog_source = %v, want api", st.CatalogSource)
			}
		})
	}
}

func TestSnapshotPass_OlderThanRecordedFallsBack(t *testing.T) {
	host := newSnapHost(t, 3, "en")
	s, cat := snapshotStore(t, 3, []string{"en"}, host)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	// A rolled-back publisher: what is applied is newer than what is offered.
	newer := host.gen.Add(time.Hour)
	s.statusMu.Lock()
	s.status.CatalogGeneratedAt = &newer
	s.statusMu.Unlock()
	buf := captureLog(t)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if cat.count("/api/v1/exercises/export", "") != 1 || !strings.Contains(buf.String(), "older than the") {
		t.Errorf("expected an API pass with the reason logged; export=%d log=%s", cat.count("/api/v1/exercises/export", ""), buf.String())
	}
}

func TestSnapshotPass_SecondSourceUsedWhenTheFirstFails(t *testing.T) {
	bad := newSnapHost(t, 3, "en", "es")
	bad.mu.Lock()
	bad.tamper = func(m map[string]any) { m["schema_version"] = 2 }
	bad.publish()
	bad.mu.Unlock()
	good := newSnapHost(t, 3, "en", "es")
	s, cat := snapshotStore(t, 3, []string{"en", "es"}, bad, good)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if len(cat.snapshot()) != 0 {
		t.Errorf("API was used though the second snapshot was fine: %+v", cat.snapshot())
	}
	st, _ := s.CacheStatus()
	if st.CatalogSource == nil || *st.CatalogSource != "snapshot:"+good.url() {
		t.Errorf("catalog_source = %v", st.CatalogSource)
	}
}

func TestSnapshotPass_UnchangedManifestSkipsTheImport(t *testing.T) {
	host := newSnapHost(t, 3, "en", "es")
	s, cat := snapshotStore(t, 3, []string{"en", "es"}, host)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	files, manifests := host.fileRequests(), host.manifestRequests()
	before := dumpCatalog(t, s)
	first, _ := s.CacheStatus()
	// A row edited locally is not repaired by a skipped pass: the skip imports nothing.
	if _, err := s.db.Exec(`UPDATE exercises SET equipment = 'edited' WHERE oedb_id = 'uuid-000'`); err != nil {
		t.Fatal(err)
	}
	time.Sleep(5 * time.Millisecond)

	n, err := s.syncCatalog(t.Context())
	if err != nil || n != 3 {
		t.Fatalf("skipped pass = %d, %v", n, err)
	}
	if host.fileRequests() != files {
		t.Errorf("file requests %d -> %d on a skipped pass", files, host.fileRequests())
	}
	if host.manifestRequests() != manifests+1 {
		t.Errorf("manifest requests %d -> %d, want one conditional", manifests, host.manifestRequests())
	}
	if len(cat.snapshot()) != 0 {
		t.Errorf("API requests: %+v", cat.snapshot())
	}
	if got := dumpCatalog(t, s); strings.Contains(got, "edited") == strings.Contains(before, "edited") {
		t.Errorf("the skipped pass re-imported rows")
	}
	st, _ := s.CacheStatus()
	if st.LastSyncedAt == nil || !st.LastSyncedAt.After(*first.LastSyncedAt) || st.LastFailed {
		t.Errorf("a skipped pass must still record a successful pass: %+v vs %+v", st, first)
	}

	// A newer manifest imports again.
	host.mu.Lock()
	host.gen = host.gen.Add(time.Minute)
	host.publish()
	host.mu.Unlock()
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	var eq string
	_ = s.db.QueryRow(`SELECT equipment FROM exercises WHERE oedb_id = 'uuid-000'`).Scan(&eq)
	if eq == "edited" {
		t.Errorf("a newer snapshot was not imported")
	}
}

func TestSnapshotPass_NoSkipAfterAnAPIPassOrAFailure(t *testing.T) {
	failed := "other"
	api := "api"
	cases := map[string]func(st *models.ExerciseCacheStatus){
		"last pass failed":     func(st *models.ExerciseCacheStatus) { st.LastFailure = &failed },
		"last source was api":  func(st *models.ExerciseCacheStatus) { st.CatalogSource = &api },
		"no recorded stamp":    func(st *models.ExerciseCacheStatus) { st.CatalogGeneratedAt = nil },
		"source never written": func(st *models.ExerciseCacheStatus) { st.CatalogSource = nil },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			host := newSnapHost(t, 3, "en")
			s, _ := snapshotStore(t, 3, []string{"en"}, host)
			if _, err := s.syncCatalog(t.Context()); err != nil {
				t.Fatal(err)
			}
			if _, err := s.db.Exec(`UPDATE exercises SET equipment = 'edited'`); err != nil {
				t.Fatal(err)
			}
			s.statusMu.Lock()
			mutate(&s.status)
			s.statusMu.Unlock()
			if _, err := s.syncCatalog(t.Context()); err != nil {
				t.Fatal(err)
			}
			if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE equipment = 'edited'`); got != 0 {
				t.Errorf("the pass was skipped: %d rows still edited", got)
			}
		})
	}
}

func TestSnapshotPass_ShrinkGuardAppliesAndConfirmPasses(t *testing.T) {
	host := newSnapHost(t, 3, "en", "es")
	s, cat := snapshotStore(t, 3, []string{"en", "es"}, host)
	holdEnglish(t, s, 10)

	_, err := s.syncCatalog(t.Context())
	if !errors.Is(err, ErrCatalogShrank) {
		t.Fatalf("err = %v, want ErrCatalogShrank", err)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE upstream_missing_at IS NOT NULL`); got != 0 {
		t.Errorf("%d rows hidden by a refused pass", got)
	}
	if len(cat.snapshot()) != 0 {
		t.Errorf("a data error must not fall back to the API: %+v", cat.snapshot())
	}
	st, _ := s.CacheStatus()
	if !st.LastFailed || st.CatalogSource != nil {
		t.Errorf("a failed pass must not record a source: %+v", st)
	}

	if _, err := s.RefreshCachedConfirmed(t.Context()); err != nil {
		t.Fatalf("confirmed pass: %v", err)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE upstream_missing_at IS NOT NULL`); got != 7 {
		t.Errorf("hidden = %d, want 7", got)
	}
}

func TestSnapshotPass_EmptyEnglishIsRefused(t *testing.T) {
	host := newSnapHost(t, 0, "en")
	s, _ := snapshotStore(t, 0, []string{"en"}, host)
	holdEnglish(t, s, 4)
	if _, err := s.syncCatalog(t.Context()); !errors.Is(err, ErrCatalogUnreachable) {
		t.Fatalf("err = %v, want the empty-export refusal", err)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE upstream_missing_at IS NOT NULL`); got != 0 {
		t.Errorf("%d rows hidden", got)
	}
}

func TestSnapshotPass_NonEnglishNeverInsertsOrUnhides(t *testing.T) {
	host := newSnapHost(t, 4, "en", "es")
	s, _ := snapshotStore(t, 4, []string{"en", "es"}, host)
	holdEnglish(t, s, 5)
	// uuid-004 is gone from the English file; the first pass hides it.
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-004' AND upstream_missing_at IS NOT NULL`); got != 1 {
		t.Fatalf("uuid-004 not hidden")
	}

	// A hand-built pass whose es list names the hidden row and one never held.
	snap := &snapshotPass{LoadedSnapshot: &oedb.LoadedSnapshot{Exercises: map[string][]oedb.Exercise{"es": {
		served("uuid-004", "Escondido", "es", []string{"Uno."}, "es"),
		served("uuid-999", "Nuevo", "es", []string{"Uno."}, "es"),
		served("uuid-001", "Hola", "es", []string{"Uno."}, "es"),
	}}}, alias: map[string]string{}}
	if _, err := s.refreshFrom(t.Context(), "es", false, snap, nil); err != nil {
		t.Fatal(err)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-004' AND upstream_missing_at IS NOT NULL`); got != 1 {
		t.Errorf("a non-English file un-hid a missing row")
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-999'`); got != 0 {
		t.Errorf("a non-English file inserted a row")
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations t JOIN exercises e ON e.id = t.exercise_id WHERE e.oedb_id = 'uuid-004' AND t.name = 'Escondido'`); got != 0 {
		t.Errorf("a hidden row received a translation")
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE name = 'Hola'`); got != 1 {
		t.Errorf("a held row did not receive its translation")
	}
}

func TestSnapshotPass_DroppedLocalesPurgedFromTheManifest(t *testing.T) {
	host := newSnapHost(t, 3, "en", "es")
	s, _ := snapshotStore(t, 3, []string{"en", "es"}, host)
	holdEnglish(t, s, 3)
	materialize(t, s, "pt", served("uuid-000", "Agachamento", "pt", []string{"Um."}, "pt"))
	materialize(t, s, "fr", served("uuid-000", "Squat fr", "fr", []string{"Un."}, "fr"))
	materialize(t, s, "de", served("uuid-000", "Kniebeuge", "de", []string{"Eins."}, "de"))
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	// Three of four held languages dropped is over half: the existing guard keeps them.
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'pt'`); got != 1 {
		t.Errorf("pt translations = %d, want the purge guard to keep them", got)
	}
}

func TestSnapshotPass_SourceAndStampSurviveARestart(t *testing.T) {
	host := newSnapHost(t, 3, "en")
	s, _ := snapshotStore(t, 3, []string{"en"}, host)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	fresh := NewExerciseStore(s.db)
	if err := fresh.loadSyncState(); err != nil {
		t.Fatal(err)
	}
	st, _ := fresh.CacheStatus()
	if st.CatalogSource == nil || *st.CatalogSource != "snapshot:"+host.url() || st.CatalogGeneratedAt == nil || !st.CatalogGeneratedAt.Equal(host.gen) {
		t.Errorf("reloaded status = %+v", st)
	}
}

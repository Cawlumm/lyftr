package stores

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/Cawlumm/lyftr-backend/oedb"
)

func markRemoved(t *testing.T, conn *sql.DB, oedbIDs ...string) {
	t.Helper()
	for _, id := range oedbIDs {
		if _, err := conn.Exec(`UPDATE exercises SET upstream_missing_at = CURRENT_TIMESTAMP WHERE oedb_id = ?`, id); err != nil {
			t.Fatal(err)
		}
	}
}

func marked(t *testing.T, conn *sql.DB) int {
	t.Helper()
	return countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE upstream_missing_at IS NOT NULL`)
}

func isMarked(t *testing.T, conn *sql.DB, oedbID string) bool {
	t.Helper()
	return countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE oedb_id = ? AND upstream_missing_at IS NOT NULL`, oedbID) == 1
}

func (c *localeCatalog) setUpstream(n int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.upstream = n
}

func listedNames(t *testing.T, s *ExerciseStore, f ExerciseFilter) []string {
	t.Helper()
	got, err := s.List(f)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, e := range got {
		names = append(names, e.Name)
	}
	return names
}

func TestList_HidesRowsRemovedUpstream(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	materialize(t, s, "en", catalogExercise("uuid-a", "Alpha Press"), catalogExercise("uuid-b", "Bravo Press"), catalogExercise("uuid-c", "Charlie Press"))
	if _, err := conn.Exec(`INSERT INTO exercises (name, muscle_group) VALUES ('Legacy Press', 'chest')`); err != nil {
		t.Fatal(err)
	}
	materialize(t, s, "es", served("uuid-b", "Prensa Bravo", "es", []string{"Uno."}, "es"))
	markRemoved(t, conn, "uuid-b")
	id := localID(t, s, "uuid-b")

	names := listedNames(t, s, ExerciseFilter{Limit: 100})
	if len(names) != 3 {
		t.Errorf("List = %v, want the three that remain", names)
	}
	for _, n := range names {
		if n == "Bravo Press" {
			t.Errorf("List returned the removed exercise: %v", names)
		}
	}
	if got := listedNames(t, s, ExerciseFilter{Limit: 100, Query: "Bravo"}); len(got) != 0 {
		t.Errorf("List(q=Bravo) = %v, want none", got)
	}
	if got := listedNames(t, s, ExerciseFilter{Limit: 100, Query: "Prensa", Locale: "es"}); len(got) != 0 {
		t.Errorf("List(q=Prensa, es) matched through the translation: %v", got)
	}
	if got := mustGet(t, s, id, "en").Name; got != "Bravo Press" {
		t.Errorf("Get = %q, want the removed exercise still resolvable by id", got)
	}

	got, err := s.Search(context.Background(), ExerciseFilter{Limit: 100})
	if err != nil || len(got) != 3 {
		t.Errorf("Search without a catalog = %d rows, %v, want 3", len(got), err)
	}

	cat := newLocaleCatalog(t, 3, "en")
	cat.setFail("/api/v1/exercises", "")
	cat.setFail("/api/v1/exercises/export", "")
	s.UseCatalog(oedb.New(cat.srv.URL, "test"))
	got, err = s.Search(context.Background(), ExerciseFilter{Limit: 100})
	if err != nil || len(got) != 3 {
		t.Errorf("Search on the offline fallback = %d rows, %v, want 3", len(got), err)
	}
	for _, e := range got {
		if e.Name == "Bravo Press" {
			t.Error("the offline fallback returned the removed exercise")
		}
	}
}

func TestMaterialize_RecordingARemovedExerciseUnhidesIt(t *testing.T) {
	s := NewExerciseStore(testDB(t))
	materialize(t, s, "en", catalogExercise("uuid-001", "Row"))
	markRemoved(t, s.db, "uuid-001")
	materialize(t, s, "en", catalogExercise("uuid-001", "Row"))
	if isMarked(t, s.db, "uuid-001") {
		t.Error("an English re-record must clear the mark")
	}
	markRemoved(t, s.db, "uuid-001")
	materialize(t, s, "es", served("uuid-001", "Remo", "es", []string{"Uno."}, "es"))
	if isMarked(t, s.db, "uuid-001") {
		t.Error("a Spanish re-record must clear the mark")
	}
}

func TestMaterialize_NewUpstreamIDAdoptsARemovedRowOfTheSameName(t *testing.T) {
	s := NewExerciseStore(testDB(t))
	materialize(t, s, "en", catalogExercise("uuid-a", "Bench Press"))
	id := localID(t, s, "uuid-a")

	materialize(t, s, "en", catalogExercise("uuid-b", "Bench Press"))
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-b'`); got != 0 {
		t.Fatalf("a live row must not be taken over, uuid-b rows = %d", got)
	}

	markRemoved(t, s.db, "uuid-a")
	materialize(t, s, "en", catalogExercise("uuid-b", "Bench Press"))
	if got := localID(t, s, "uuid-b"); got != id {
		t.Errorf("uuid-b local id = %d, want the removed row %d", got, id)
	}
	if marked(t, s.db) != 0 || countRows(t, s.db, `SELECT COUNT(*) FROM exercises`) != 1 {
		t.Error("want one visible row")
	}
}

func TestSyncCatalog_HidesExercisesRemovedUpstream(t *testing.T) {
	s, cat := syncStore(t, 10, "en")
	if _, err := s.db.Exec(`INSERT INTO exercises (name) VALUES ('Legacy Row')`); err != nil {
		t.Fatal(err)
	}
	uid := seedUser(t, s.db)
	res, err := s.db.Exec(`INSERT INTO workouts (user_id, name) VALUES (?, 'W')`, uid)
	if err != nil {
		t.Fatal(err)
	}
	wid, _ := res.LastInsertId()
	gone := localID(t, s, "uuid-009")
	if _, err := s.db.Exec(`INSERT INTO workout_exercises (workout_id, exercise_id, order_index) VALUES (?, ?, 0)`, wid, gone); err != nil {
		t.Fatal(err)
	}
	total := countRows(t, s.db, `SELECT COUNT(*) FROM exercises`)

	cat.setUpstream(8)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}

	if !isMarked(t, s.db, "uuid-008") || !isMarked(t, s.db, "uuid-009") || marked(t, s.db) != 2 {
		t.Errorf("marked = %d, want exactly uuid-008 and uuid-009 (legacy and present rows untouched)", marked(t, s.db))
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises`); got != total {
		t.Errorf("exercise rows = %d, want %d: nothing is ever deleted", got, total)
	}
	names := listedNames(t, s, ExerciseFilter{Limit: 100})
	if len(names) != 9 {
		t.Errorf("List = %d rows, want 9 (8 present + legacy)", len(names))
	}
	if got := mustGet(t, s, gone, "en").Name; got != "Exercise 009" {
		t.Errorf("Get = %q", got)
	}
	w, err := NewWorkoutStore(s.db).Get(uid, wid, "en")
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Exercises) != 1 || w.Exercises[0].Exercise.Name != "Exercise 009" {
		t.Errorf("workout exercises = %+v, want the removed exercise still joined by name", w.Exercises)
	}

	cat.setUpstream(10)
	cat.setRev(1)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if marked(t, s.db) != 0 {
		t.Errorf("marked = %d after the exercises reappeared, want 0", marked(t, s.db))
	}
	if got := listedNames(t, s, ExerciseFilter{Limit: 100}); len(got) != 11 {
		t.Errorf("List = %d rows, want 11", len(got))
	}
}

func TestSyncCatalog_TruncatedExportMarksNothing(t *testing.T) {
	s, cat := syncStore(t, 10, "en")
	cat.setUpstream(4)
	_, err := s.syncCatalog(t.Context())
	if !errors.Is(err, ErrCatalogUnreachable) {
		t.Fatalf("err = %v, want ErrCatalogUnreachable so the pass is retried", err)
	}
	if marked(t, s.db) != 0 {
		t.Errorf("marked = %d, want 0", marked(t, s.db))
	}

	s2, cat2 := syncStore(t, 10, "en")
	cat2.setUpstream(5)
	if _, err := s2.syncCatalog(t.Context()); err != nil {
		t.Fatalf("exactly half is allowed: %v", err)
	}
	if marked(t, s2.db) != 5 {
		t.Errorf("marked = %d, want 5", marked(t, s2.db))
	}
}

func TestSyncCatalog_EmptyExportWithHeldRowsMarksNothing(t *testing.T) {
	s, cat := syncStore(t, 10, "en")
	cat.setUpstream(0)
	_, err := s.syncCatalog(t.Context())
	if !errors.Is(err, ErrCatalogUnreachable) {
		t.Fatalf("err = %v, want ErrCatalogUnreachable", err)
	}
	if marked(t, s.db) != 0 {
		t.Errorf("marked = %d, want 0", marked(t, s.db))
	}
}

func TestSyncCatalog_FailedEnglishImportMarksNothing(t *testing.T) {
	s, cat := syncStore(t, 10, "en")
	if _, err := s.db.Exec(`CREATE TRIGGER fail_import BEFORE UPDATE ON exercises WHEN NEW.oedb_id = 'uuid-003' BEGIN SELECT RAISE(ABORT, 'boom'); END`); err != nil {
		t.Fatal(err)
	}
	cat.setUpstream(8)
	if _, err := s.syncCatalog(t.Context()); err == nil {
		t.Fatal("want the failed import reported")
	}
	if marked(t, s.db) != 0 {
		t.Errorf("marked = %d, want 0: no mark unless the whole export imported", marked(t, s.db))
	}
}

func TestSyncCatalog_RemovalMarkIsIdempotent(t *testing.T) {
	s, cat := syncStore(t, 10, "en")
	cat.setUpstream(8)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE exercises SET upstream_missing_at = '2000-01-01 00:00:00' WHERE oedb_id = 'uuid-009'`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-009' AND upstream_missing_at = '2000-01-01 00:00:00'`); got != 1 {
		t.Error("a second pass must keep the first timestamp")
	}
	if marked(t, s.db) != 2 {
		t.Errorf("marked = %d, want 2", marked(t, s.db))
	}
}

func TestSyncCatalog_SkipsTranslationReadsForRemovedExercises(t *testing.T) {
	s, cat := syncStore(t, 10, "en", "es")
	cat.setUpstream(8)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	for _, c := range cat.snapshot() {
		if c.path == "/api/v1/exercises" && (strings.Contains(c.ids, "uuid-008") || strings.Contains(c.ids, "uuid-009")) {
			t.Errorf("re-read %q for a removed exercise", c.ids)
		}
	}
	if !isMarked(t, s.db, "uuid-008") || !isMarked(t, s.db, "uuid-009") {
		t.Error("the translation pass must not un-hide a removed exercise")
	}
}

func TestSyncCatalog_PurgesTranslationsOfDroppedLanguages(t *testing.T) {
	s, cat := syncStore(t, 10, "en", "es", "fr")
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'fr'`) != 10 {
		t.Fatal("fr should be held before the language is dropped")
	}
	base := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE name LIKE 'Exercise %' AND description <> ''`)

	cat.setLocales("en", "es-MX")
	cat.setRev(1)
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'fr'`); got != 0 {
		t.Errorf("fr translations = %d, want 0", got)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'es-MX'`); got != 10 {
		t.Errorf("es-MX translations = %d, want 10", got)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE name LIKE 'Exercise %' AND description <> ''`); got != base {
		t.Errorf("English rows = %d, want %d untouched", got, base)
	}
}

func TestPurgeDroppedLocales_KeepsTheBaseOfAnOfferedRegion(t *testing.T) {
	s := NewExerciseStore(testDB(t))
	materialize(t, s, "en", catalogExercise("uuid-1", "One"))
	id := localID(t, s, "uuid-1")
	for _, l := range []string{"es", "es-MX", "pt-BR", "fr"} {
		if _, err := s.db.Exec(`INSERT INTO exercise_translations (exercise_id, locale, name) VALUES (?, ?, ?)`, id, l, l); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.purgeDroppedLocales([]string{"es-MX", "pt"}); err != nil {
		t.Fatal(err)
	}
	var got []string
	rows, _ := s.db.Query(`SELECT locale FROM exercise_translations ORDER BY locale`)
	for rows.Next() {
		var l string
		rows.Scan(&l)
		got = append(got, l)
	}
	rows.Close()
	if fmt.Sprint(got) != "[es es-MX]" {
		t.Errorf("locales left = %v, want [es es-MX]", got)
	}
}

func TestSyncCatalog_KeepsTranslationsWhenDiscoveryFailsOrIsEmpty(t *testing.T) {
	s, cat := syncStore(t, 5, "en", "es", "fr")
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	before := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations`)
	if before != 10 {
		t.Fatalf("translations = %d, want 10", before)
	}

	cat.setFail("/api/v1/meta/locales", "")
	if _, err := s.syncCatalog(t.Context()); err == nil {
		t.Fatal("want the discovery failure reported")
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations`); got != before {
		t.Errorf("translations = %d after a failed discovery, want %d", got, before)
	}

	cat.mu.Lock()
	delete(cat.failPath, "/api/v1/meta/locales")
	cat.mu.Unlock()
	cat.setLocales()
	if _, err := s.syncCatalog(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations`); got != before {
		t.Errorf("translations = %d after an empty discovery, want %d", got, before)
	}
}

// One discovery answer must not be able to wipe the translations: dropping most of the
// held languages at once is far more likely a bad answer than a catalog that shrank.
func TestPurgeDroppedLocales_RefusesToDropMostLanguagesAtOnce(t *testing.T) {
	s := NewExerciseStore(testDB(t))
	materialize(t, s, "en", catalogExercise("uuid-1", "One"))
	id := localID(t, s, "uuid-1")
	for _, l := range []string{"es", "fr", "de"} {
		if _, err := s.db.Exec(`INSERT INTO exercise_translations (exercise_id, locale, name) VALUES (?, ?, ?)`, id, l, l); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.purgeDroppedLocales([]string{"es"}); err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations`); n != 3 {
		t.Errorf("translations = %d, want all 3 kept when 2 of 3 languages would go", n)
	}
	if err := s.purgeDroppedLocales([]string{"es", "fr"}); err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, s.db, `SELECT COUNT(*) FROM exercise_translations`); n != 2 {
		t.Errorf("translations = %d, want 2 after dropping 1 of 3", n)
	}
}

// A search answered from the response cache can still list an exercise the daily pass
// has just found removed. Recording that answer must not bring the exercise back.
func TestSyncCatalog_RemovalIsNotUndoneByACachedSearch(t *testing.T) {
	var removed atomic.Bool
	both := []oedb.Exercise{catalogExercise("uuid-x", "Squat X"), catalogExercise("uuid-y", "Squat Y")}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "max-age=300")
		items := both
		if removed.Load() {
			items = both[1:]
		}
		switch r.URL.Path {
		case "/api/v1/meta/locales":
			fmt.Fprint(w, `{"locales":[{"code":"en"}],"total":1}`)
		case "/api/v1/exercises/export":
			json.NewEncoder(w).Encode(map[string]any{"exercises": items})
		default:
			if removed.Load() && r.URL.Query().Get("q") != "" {
				items = both[1:]
			} else if !removed.Load() {
				items = both
			}
			json.NewEncoder(w).Encode(map[string]any{"exercises": items, "total": len(items)})
		}
	}))
	defer srv.Close()

	s := NewExerciseStore(testDB(t))
	s.UseCatalog(oedb.New(srv.URL, "test"))
	names := func() []string {
		out, err := s.Search(context.Background(), ExerciseFilter{Query: "squat", Limit: 50})
		if err != nil {
			t.Fatal(err)
		}
		var n []string
		for _, e := range out {
			n = append(n, e.Name)
		}
		return n
	}

	if got := names(); len(got) != 2 {
		t.Fatalf("before the removal, search = %v, want both", got)
	}
	removed.Store(true)
	if _, err := s.syncCatalog(context.Background()); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if got := names(); slices.Contains(got, "Squat X") {
		t.Errorf("search after the removal = %v, want Squat X to stay hidden", got)
	}
	list, err := s.List(ExerciseFilter{Query: "squat", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range list {
		if e.Name == "Squat X" {
			t.Error("the removed exercise was un-hidden by a search")
		}
	}
}

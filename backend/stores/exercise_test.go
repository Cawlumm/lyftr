package stores

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/oedb"
	_ "modernc.org/sqlite"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	name := fmt.Sprintf("file:storetest_%d?mode=memory&cache=shared&_pragma=foreign_keys(on)", rand.Int63())
	conn, err := sql.Open("sqlite", name)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := conn.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	prev := db.DB
	db.DB = conn
	if err := db.BuildSchema(); err != nil {
		t.Fatalf("schema: %v", err)
	}
	t.Cleanup(func() {
		conn.Close()
		db.DB = prev
	})
	return conn
}

func catalogExercise(id, name string) oedb.Exercise {
	return oedb.Exercise{
		ID:               id,
		Slug:             name,
		MuscleGroup:      "chest",
		SecondaryMuscles: []string{"triceps"},
		Category:         "strength",
		Equipment:        "barbell",
		Images:           []oedb.Image{{URL: "/api/v1/images/img-1"}},
		Translation: oedb.Translation{
			Name:         name,
			Instructions: []string{"Step one.", "Step two."},
		},
	}
}

// A legacy row — one seeded from free-exercise-db before oedb existed — must keep
// its integer id when the catalog claims it. That id is what every saved workout
// and program references, through a foreign key with no cascade: replacing the
// row instead of adopting it would either fail the insert or, worse, silently
// repoint someone's logged sets at a different exercise.
func TestMaterialize_AdoptsLegacyRowByNameAndKeepsID(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	res, err := conn.Exec(`INSERT INTO exercises (name, muscle_group, category, equipment, description)
		VALUES ('Bench Press', 'chest', 'strength', 'barbell', 'old text')`)
	if err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}
	legacyID, _ := res.LastInsertId()

	out, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-1", "Bench Press")}, "https://oedb.test", "en")
	if err != nil {
		t.Fatalf("materialize: %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("got %d rows, want 1", len(out))
	}
	if out[0].ID != legacyID {
		t.Errorf("legacy id changed: got %d, want %d", out[0].ID, legacyID)
	}

	var n int
	conn.QueryRow(`SELECT COUNT(*) FROM exercises`).Scan(&n)
	if n != 1 {
		t.Errorf("got %d exercises, want 1 (row was duplicated, not adopted)", n)
	}

	var oedbID string
	conn.QueryRow(`SELECT oedb_id FROM exercises WHERE id = ?`, legacyID).Scan(&oedbID)
	if oedbID != "uuid-1" {
		t.Errorf("oedb_id = %q, want uuid-1", oedbID)
	}
	if out[0].Description != "1. Step one.\n2. Step two." {
		t.Errorf("description = %q, want the numbered form", out[0].Description)
	}
	if out[0].ImageURL != "https://oedb.test/api/v1/images/img-1" {
		t.Errorf("image_url = %q, want an absolute oedb URL", out[0].ImageURL)
	}
}

// An upstream rename must update the row Lyftr already holds for that exercise,
// not insert a second one. Matching on name alone cannot do this: the new name
// matches nothing, so the row would be inserted and the catalog would then hold
// the same exercise twice under two ids — with a user's history attached to the
// stale one.
func TestMaterialize_UpstreamRenameUpdatesSameRow(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	first, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-1", "Barbell Bench Press")}, "https://oedb.test", "en")
	if err != nil {
		t.Fatalf("first materialize: %v", err)
	}

	second, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-1", "Bench Press (Barbell)")}, "https://oedb.test", "en")
	if err != nil {
		t.Fatalf("second materialize: %v", err)
	}

	if first[0].ID != second[0].ID {
		t.Errorf("rename moved the row: %d then %d", first[0].ID, second[0].ID)
	}
	var n int
	conn.QueryRow(`SELECT COUNT(*) FROM exercises`).Scan(&n)
	if n != 1 {
		t.Errorf("got %d exercises after rename, want 1", n)
	}
	if second[0].Name != "Bench Press (Barbell)" {
		t.Errorf("name = %q, want the new upstream name", second[0].Name)
	}
}

func TestMaterialize_DecodesSecondaryMuscles(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	out, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-1", "Bench Press")}, "https://oedb.test", "en")
	if err != nil {
		t.Fatalf("materialize: %v", err)
	}
	if len(out[0].SecondaryMuscles) != 1 || out[0].SecondaryMuscles[0] != "triceps" {
		t.Errorf("secondary_muscles = %v, want [triceps]", out[0].SecondaryMuscles)
	}

	var raw string
	conn.QueryRow(`SELECT secondary_muscles FROM exercises WHERE oedb_id = 'uuid-1'`).Scan(&raw)
	var decoded []string
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Errorf("stored secondary_muscles is not valid JSON: %q", raw)
	}
}

// With no catalog configured the store must answer from the local table rather
// than error. Self-hosted instances that never set OEDB_BASE_URL, and every test
// in this repo, depend on that path.
func TestSearch_WithoutCatalogUsesLocalTable(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	if _, err := conn.Exec(`INSERT INTO exercises (name, muscle_group) VALUES ('Local Only', 'chest')`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	got, err := s.Search(context.Background(), ExerciseFilter{Limit: 10})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(got) != 1 || got[0].Name != "Local Only" {
		t.Fatalf("got %v, want the local row", got)
	}
}

// The catalog being unreachable must degrade to the local snapshot, not fail the
// request. Someone mid-workout with no route to oedb still needs their exercise
// list.
func TestSearch_FallsBackToLocalWhenCatalogFails(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	// A port nothing listens on: the client fails to connect rather than
	// returning an error status, which is the outage shape being modelled.
	s.UseCatalog(oedb.New("http://127.0.0.1:1", "test"))

	if _, err := conn.Exec(`INSERT INTO exercises (name, muscle_group) VALUES ('Cached Squat', 'quadriceps')`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	got, err := s.Search(context.Background(), ExerciseFilter{Limit: 10})
	if err != nil {
		t.Fatalf("search returned an error instead of falling back: %v", err)
	}
	if len(got) != 1 || got[0].Name != "Cached Squat" {
		t.Fatalf("got %v, want the locally cached row", got)
	}
}

func TestCacheControls_WithoutCatalogError(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	if _, err := s.RefreshCached(context.Background()); !errors.Is(err, ErrNoCatalog) {
		t.Errorf("RefreshCached err = %v, want ErrNoCatalog", err)
	}
	if err := s.PrimeQuery(context.Background(), "squat"); !errors.Is(err, ErrNoCatalog) {
		t.Errorf("PrimeQuery err = %v, want ErrNoCatalog", err)
	}
}

// Clearing the cache must leave anything a workout or program references. Those
// foreign keys have no cascade, so deleting a referenced row would either be
// refused or, without the FK, orphan a user's logged sets.
func TestClearUnreferenced_KeepsReferencedRows(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	if _, err := conn.Exec(`INSERT INTO exercises (id, name) VALUES (1, 'Used'), (2, 'Unused')`); err != nil {
		t.Fatalf("seed exercises: %v", err)
	}
	if _, err := conn.Exec(`INSERT INTO users (id, email, password_hash) VALUES (1, 'a@b.c', 'x')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := conn.Exec(`INSERT INTO workouts (id, user_id, name) VALUES (1, 1, 'W')`); err != nil {
		t.Fatalf("seed workout: %v", err)
	}
	if _, err := conn.Exec(`INSERT INTO workout_exercises (workout_id, exercise_id, order_index) VALUES (1, 1, 0)`); err != nil {
		t.Fatalf("seed workout_exercise: %v", err)
	}

	n, err := s.ClearUnreferenced()
	if err != nil {
		t.Fatalf("clear: %v", err)
	}
	if n != 1 {
		t.Errorf("cleared %d, want 1", n)
	}
	var remaining string
	if err := conn.QueryRow(`SELECT name FROM exercises`).Scan(&remaining); err != nil {
		t.Fatalf("read remaining: %v", err)
	}
	if remaining != "Used" {
		t.Errorf("remaining = %q, want the referenced row", remaining)
	}
}

// Refresh applies upstream edits to rows already held, and must not import rows
// the instance has never seen — that is the line between refreshing a cache and
// seeding a library.
func TestRefreshCached_UpdatesHeldRowsWithoutImporting(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"exercises":[
			{"id":"uuid-1","slug":"held","muscle_group":"chest","translation":{"name":"Held Renamed","instructions":[]}},
			{"id":"uuid-2","slug":"new","muscle_group":"back","translation":{"name":"Never Seen","instructions":[]}}
		],"total":2}`)
	}))
	defer srv.Close()

	conn := testDB(t)
	s := NewExerciseStore(conn)
	s.UseCatalog(oedb.New(srv.URL, "test"))

	if _, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-1", "Held Original")}, srv.URL, "en"); err != nil {
		t.Fatalf("seed held row: %v", err)
	}

	n, err := s.RefreshCached(context.Background())
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if n != 1 {
		t.Errorf("refreshed %d, want 1", n)
	}

	var total int
	conn.QueryRow(`SELECT COUNT(*) FROM exercises`).Scan(&total)
	if total != 1 {
		t.Errorf("exercise count = %d, want 1 — refresh imported an unseen row", total)
	}
	var name string
	conn.QueryRow(`SELECT name FROM exercises WHERE oedb_id = 'uuid-1'`).Scan(&name)
	if name != "Held Renamed" {
		t.Errorf("name = %q, want the upstream edit applied", name)
	}
}

// oedb caps per_page at 100. A filtered request for more than that must walk the
// pages rather than quietly returning the first one — the local table it replaced
// answered such a query in full.
func TestSearch_PaginatesFilteredResultsBeyondOnePage(t *testing.T) {
	const total = 250
	var pages int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&pages, 1)
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page == 0 {
			page = 1
		}
		perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
		if perPage <= 0 || perPage > 100 {
			// Mirror oedb: above 100 is rejected, not clamped.
			w.WriteHeader(http.StatusUnprocessableEntity)
			return
		}
		start := (page - 1) * perPage
		var items []string
		for i := start; i < start+perPage && i < total; i++ {
			items = append(items, fmt.Sprintf(
				`{"id":"uuid-%d","slug":"ex-%d","translation":{"name":"Exercise %d","instructions":[]}}`, i, i, i))
		}
		fmt.Fprintf(w, `{"exercises":[%s],"total":%d,"page":%d,"per_page":%d}`,
			strings.Join(items, ","), total, page, perPage)
	}))
	defer srv.Close()

	conn := testDB(t)
	s := NewExerciseStore(conn)
	s.UseCatalog(oedb.New(srv.URL, "test"))

	got, err := s.Search(context.Background(), ExerciseFilter{Equipment: "dumbbell", Limit: 250})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(got) != total {
		t.Fatalf("got %d exercises, want %d (pagination stopped early)", len(got), total)
	}
	if n := atomic.LoadInt32(&pages); n != 3 {
		t.Errorf("upstream pages fetched = %d, want 3", n)
	}
}

// Paging is what lets a picker stop downloading the catalog to filter it in the
// browser, so an explicitly paged request must return that page and stop — not
// everything from that page onward.
func TestSearch_ExplicitPageReturnsOnlyThatPage(t *testing.T) {
	const total = 250
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		seen = append(seen, q.Get("page")+"/"+q.Get("per_page"))
		page, _ := strconv.Atoi(q.Get("page"))
		if page == 0 {
			page = 1
		}
		perPage, _ := strconv.Atoi(q.Get("per_page"))
		start := (page - 1) * perPage
		var items []string
		for i := start; i < start+perPage && i < total; i++ {
			items = append(items, fmt.Sprintf(
				`{"id":"uuid-%d","slug":"ex-%d","translation":{"name":"Exercise %d","instructions":[]}}`, i, i, i))
		}
		fmt.Fprintf(w, `{"exercises":[%s],"total":%d,"page":%d,"per_page":%d}`,
			strings.Join(items, ","), total, page, perPage)
	}))
	defer srv.Close()

	conn := testDB(t)
	s := NewExerciseStore(conn)
	s.UseCatalog(oedb.New(srv.URL, "test"))

	got, err := s.Search(context.Background(), ExerciseFilter{Query: "ex", Limit: 50, Page: 3})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(got) != 50 {
		t.Fatalf("got %d exercises, want 50 (one page)", len(got))
	}
	if len(seen) != 1 || seen[0] != "3/50" {
		t.Errorf("upstream requests = %v, want exactly [3/50]", seen)
	}
	if got[0].Name != "Exercise 100" {
		t.Errorf("first row = %q, want the start of page 3", got[0].Name)
	}
}

// The local fallback has to page too, or an offline picker silently repeats its
// first page forever as the user scrolls.
func TestList_LocalFallbackPages(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	for i := 0; i < 25; i++ {
		if _, err := conn.Exec(`INSERT INTO exercises (name) VALUES (?)`, fmt.Sprintf("Exercise %02d", i)); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	page1, err := s.List(ExerciseFilter{Limit: 10, Page: 1})
	if err != nil {
		t.Fatalf("page 1: %v", err)
	}
	page3, err := s.List(ExerciseFilter{Limit: 10, Page: 3})
	if err != nil {
		t.Fatalf("page 3: %v", err)
	}
	if len(page1) != 10 || len(page3) != 5 {
		t.Fatalf("page sizes = %d and %d, want 10 and 5", len(page1), len(page3))
	}
	if page1[0].Name == page3[0].Name {
		t.Errorf("page 3 repeated page 1, starting at %q", page1[0].Name)
	}
	if page3[0].Name != "Exercise 20" {
		t.Errorf("page 3 starts at %q, want Exercise 20", page3[0].Name)
	}
}

func ownerOf(t *testing.T, conn *sql.DB, id int64) string {
	t.Helper()
	var o sql.NullString
	if err := conn.QueryRow(`SELECT oedb_id FROM exercises WHERE id = ?`, id).Scan(&o); err != nil {
		t.Fatalf("owner of %d: %v", id, err)
	}
	return o.String
}

// oedb names are not unique. A second upstream id with a name another id already
// owns must not take that row over: every workout pointing at it would silently
// point at a different exercise.
func TestMaterialize_DuplicateNameDoesNotTakeOverOwnedRow(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	first, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-A", "Squat")}, imageBase, "en")
	if err != nil || len(first) != 1 {
		t.Fatalf("first: %v %v", first, err)
	}
	aID := first[0].ID
	for _, q := range []string{
		`INSERT INTO users (id, email, password_hash) VALUES (1, 'a@b.c', 'x')`,
		`INSERT INTO workouts (id, user_id, name) VALUES (1, 1, 'W')`,
	} {
		if _, err := conn.Exec(q); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	if _, err := conn.Exec(`INSERT INTO workout_exercises (workout_id, exercise_id, order_index) VALUES (1, ?, 0)`, aID); err != nil {
		t.Fatalf("seed workout_exercise: %v", err)
	}

	out, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-B", "Squat")}, imageBase, "en")
	if err != nil {
		t.Fatalf("duplicate: %v", err)
	}
	if len(out) != 0 {
		t.Errorf("skipped duplicate returned %d rows, want 0", len(out))
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises`); n != 1 {
		t.Errorf("exercises = %d, want 1", n)
	}
	if got := ownerOf(t, conn, aID); got != "uuid-A" {
		t.Errorf("owner = %q, want uuid-A", got)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-B'`); n != 0 {
		t.Errorf("uuid-B has %d rows, want 0", n)
	}
	var joined string
	if err := conn.QueryRow(`SELECT e.oedb_id FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id`).Scan(&joined); err != nil || joined != "uuid-A" {
		t.Errorf("workout points at %q (%v), want uuid-A", joined, err)
	}

	out, err = s.Materialize([]oedb.Exercise{catalogExercise("uuid-A", "Squat"), catalogExercise("uuid-B", "Squat")}, imageBase, "en")
	if err != nil {
		t.Fatalf("both: %v", err)
	}
	if got := ownerOf(t, conn, aID); got != "uuid-A" {
		t.Errorf("owner after both = %q, want uuid-A", got)
	}
	if len(out) != 1 || out[0].ID != aID {
		t.Errorf("out = %+v, want only local id %d", out, aID)
	}
}

func TestMaterialize_DuplicateInBatchKeepsTheRest(t *testing.T) {
	for _, locale := range []string{"en", "es"} {
		t.Run(locale, func(t *testing.T) {
			conn := testDB(t)
			s := NewExerciseStore(conn)
			mk := func(id, name string) oedb.Exercise {
				return served(id, name, "en", []string{"Step."}, "en")
			}
			out, err := s.Materialize([]oedb.Exercise{
				mk("uuid-A", "Squat"), mk("uuid-C", "Deadlift"), mk("uuid-B", "Squat"), mk("uuid-D", "Row"),
			}, imageBase, locale)
			if err != nil {
				t.Fatalf("Materialize: %v", err)
			}
			if len(out) != 3 {
				t.Fatalf("out = %d rows, want 3", len(out))
			}
			for i, want := range []string{"Squat", "Deadlift", "Row"} {
				if out[i].Name != want {
					t.Errorf("out[%d] = %q, want %q", i, out[i].Name, want)
				}
			}
			if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises`); n != 3 {
				t.Errorf("exercises = %d, want 3", n)
			}
			if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-A' AND name = 'Squat'`); n != 1 {
				t.Errorf("uuid-A does not own Squat")
			}
			if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-B'`); n != 0 {
				t.Errorf("uuid-B has a row")
			}
		})
	}
}

func TestMaterialize_LegacyAdoptionThenDuplicateIsSkipped(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	res, err := conn.Exec(`INSERT INTO exercises (name, muscle_group) VALUES ('Squat', 'legs')`)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	legacyID, _ := res.LastInsertId()

	out, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-A", "Squat"), catalogExercise("uuid-B", "Squat")}, imageBase, "en")
	if err != nil {
		t.Fatalf("Materialize: %v", err)
	}
	if got := ownerOf(t, conn, legacyID); got != "uuid-A" {
		t.Errorf("legacy owner = %q, want uuid-A", got)
	}
	if len(out) != 1 || out[0].ID != legacyID {
		t.Errorf("out = %+v, want only legacy id %d", out, legacyID)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises`); n != 1 {
		t.Errorf("exercises = %d, want 1", n)
	}
}

// An upstream rename onto a name another row holds cannot move the name without
// merging two rows workouts point at, so the row keeps its name and takes the rest.
func TestMaterialize_RenameOntoHeldNameKeepsCurrentName(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	if _, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-A", "Barbell Squat"), catalogExercise("uuid-B", "Squat")}, imageBase, "en"); err != nil {
		t.Fatalf("seed: %v", err)
	}
	var aID int64
	if err := conn.QueryRow(`SELECT id FROM exercises WHERE oedb_id = 'uuid-A'`).Scan(&aID); err != nil {
		t.Fatalf("a id: %v", err)
	}
	if _, err := conn.Exec(`INSERT INTO exercises (name) VALUES ('Bench Press')`); err != nil {
		t.Fatalf("legacy: %v", err)
	}

	renamed := catalogExercise("uuid-A", "Squat")
	renamed.MuscleGroup = "quadriceps"
	out, err := s.Materialize([]oedb.Exercise{renamed, catalogExercise("uuid-C", "Lunge")}, imageBase, "en")
	if err != nil {
		t.Fatalf("Materialize: %v", err)
	}
	if len(out) != 2 || out[0].ID != aID {
		t.Errorf("out = %+v, want A then C", out)
	}
	var name, muscle string
	if err := conn.QueryRow(`SELECT name, muscle_group FROM exercises WHERE id = ?`, aID).Scan(&name, &muscle); err != nil {
		t.Fatalf("read a: %v", err)
	}
	if name != "Barbell Squat" || muscle != "quadriceps" {
		t.Errorf("A = %q/%q, want Barbell Squat/quadriceps", name, muscle)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE name = 'Squat' AND oedb_id = 'uuid-B'`); n != 1 {
		t.Errorf("B lost its row")
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE oedb_id = 'uuid-C'`); n != 1 {
		t.Errorf("C not inserted")
	}

	onto := catalogExercise("uuid-A", "Bench Press")
	if _, err := s.Materialize([]oedb.Exercise{onto}, imageBase, "en"); err != nil {
		t.Fatalf("rename onto legacy: %v", err)
	}
	if err := conn.QueryRow(`SELECT name FROM exercises WHERE id = ?`, aID).Scan(&name); err != nil || name != "Barbell Squat" {
		t.Errorf("A name = %q (%v), want Barbell Squat", name, err)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE name = 'Bench Press' AND oedb_id IS NULL`); n != 1 {
		t.Errorf("legacy Bench Press was adopted")
	}
}

// idx_exercises_name is BINARY, so names differing in case are different names.
func TestMaterialize_NameOwnershipFollowsIndexCollation(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	out, err := s.Materialize([]oedb.Exercise{catalogExercise("uuid-A", "Squat"), catalogExercise("uuid-B", "squat")}, imageBase, "en")
	if err != nil {
		t.Fatalf("Materialize: %v", err)
	}
	if len(out) != 2 {
		t.Errorf("out = %d rows, want 2", len(out))
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE oedb_id IN ('uuid-A', 'uuid-B')`); n != 2 {
		t.Errorf("owned rows = %d, want 2", n)
	}
}

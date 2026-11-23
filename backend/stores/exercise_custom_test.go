package stores

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"slices"
	"testing"

	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/oedb"
)

func customStore(t *testing.T) (*ExerciseStore, *sql.DB, int64, int64) {
	t.Helper()
	conn := testDB(t)
	return NewExerciseStore(conn), conn, newUser(t, conn, "a@example.com"), newUser(t, conn, "b@example.com")
}

func newUser(t *testing.T, conn *sql.DB, email string) int64 {
	t.Helper()
	res, err := conn.Exec(`INSERT INTO users (email, password_hash) VALUES (?, 'x')`, email)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func customReq(name string) models.CreateExerciseRequest {
	return models.CreateExerciseRequest{Name: name, MuscleGroup: "chest"}
}

func mustCreate(t *testing.T, s *ExerciseStore, uid int64, name string) models.Exercise {
	t.Helper()
	e, err := s.CreateCustom(uid, customReq(name))
	if err != nil {
		t.Fatalf("CreateCustom(%q): %v", name, err)
	}
	return e
}

func useExercise(t *testing.T, conn *sql.DB, uid, exerciseID int64) (workoutID int64) {
	t.Helper()
	res, err := conn.Exec(`INSERT INTO workouts (user_id, name) VALUES (?, 'w')`, uid)
	if err != nil {
		t.Fatal(err)
	}
	workoutID, _ = res.LastInsertId()
	if _, err := conn.Exec(`INSERT INTO workout_exercises (workout_id, exercise_id) VALUES (?, ?)`, workoutID, exerciseID); err != nil {
		t.Fatal(err)
	}
	return workoutID
}

func useInProgram(t *testing.T, conn *sql.DB, uid, exerciseID int64) {
	t.Helper()
	res, err := conn.Exec(`INSERT INTO programs (user_id, name) VALUES (?, 'p')`, uid)
	if err != nil {
		t.Fatal(err)
	}
	pid, _ := res.LastInsertId()
	res, err = conn.Exec(`INSERT INTO program_days (program_id, name, order_index) VALUES (?, 'd', 0)`, pid)
	if err != nil {
		t.Fatal(err)
	}
	did, _ := res.LastInsertId()
	if _, err := conn.Exec(`INSERT INTO program_exercises (program_id, program_day_id, exercise_id) VALUES (?, ?, ?)`, pid, did, exerciseID); err != nil {
		t.Fatal(err)
	}
}

func TestCreateCustom_SameNameAsCatalogAllowed(t *testing.T) {
	s, _, a, _ := customStore(t)
	materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))
	e := mustCreate(t, s, a, "Bench Press")
	if !e.IsCustom || e.Archived || e.MergedIntoID != nil || e.Equipment != "body-only" || e.Category != "strength" {
		t.Errorf("created = %+v", e)
	}
	if got := countRows(t, s.db, `SELECT COUNT(*) FROM exercises WHERE name = 'Bench Press'`); got != 2 {
		t.Errorf("rows named Bench Press = %d, want catalog + custom", got)
	}
}

func TestCreateCustom_TwoUsersSameName(t *testing.T) {
	s, _, a, b := customStore(t)
	mustCreate(t, s, a, "Zottman Curl")
	mustCreate(t, s, b, "Zottman Curl")
}

func TestCreateCustom_DuplicateForSameUserRejectedCaseInsensitive(t *testing.T) {
	s, _, a, _ := customStore(t)
	mustCreate(t, s, a, "Zottman Curl")
	if _, err := s.CreateCustom(a, customReq("zottman CURL")); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("err = %v, want ErrNameTaken", err)
	}
}

func TestCreateCustom_ArchivedNameCanBeReused(t *testing.T) {
	s, _, a, _ := customStore(t)
	old := mustCreate(t, s, a, "Zottman Curl")
	if _, err := s.Archive(a, old.ID); err != nil {
		t.Fatal(err)
	}
	mustCreate(t, s, a, "Zottman Curl")
}

func TestUnarchive_NameTakenRejected(t *testing.T) {
	s, _, a, _ := customStore(t)
	old := mustCreate(t, s, a, "Zottman Curl")
	if _, err := s.Archive(a, old.ID); err != nil {
		t.Fatal(err)
	}
	mustCreate(t, s, a, "zottman curl")
	if _, err := s.Unarchive(a, old.ID); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("err = %v, want ErrNameTaken", err)
	}
	got, _ := s.Get(old.ID, "en", a)
	if !got.Archived {
		t.Error("a refused unarchive must leave the row archived")
	}
}

func TestCreateCustom_Limit(t *testing.T) {
	s, conn, a, b := customStore(t)
	if _, err := conn.Exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
		INSERT INTO exercises (name, owner_user_id) SELECT 'x' || i, ? FROM n`, MaxCustomExercises, a); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateCustom(a, customReq("One too many")); !errors.Is(err, ErrCustomLimit) {
		t.Fatalf("err = %v, want ErrCustomLimit", err)
	}
	mustCreate(t, s, b, "Other user is unaffected")
	if _, err := conn.Exec(`UPDATE exercises SET archived_at = CURRENT_TIMESTAMP WHERE name = 'x1'`); err != nil {
		t.Fatal(err)
	}
	mustCreate(t, s, a, "Fits after an archive")

	// Restoring is creating again as far as the cap goes.
	var x1 int64
	if err := conn.QueryRow(`SELECT id FROM exercises WHERE name = 'x1'`).Scan(&x1); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Unarchive(a, x1); !errors.Is(err, ErrCustomLimit) {
		t.Fatalf("unarchive at the cap: err = %v, want ErrCustomLimit", err)
	}
}

func TestCreateCustom_NormalizesAndValidates(t *testing.T) {
	s, _, a, _ := customStore(t)
	e, err := s.CreateCustom(a, models.CreateExerciseRequest{
		Name: "  Sled Push ", MuscleGroup: "Quadriceps", SecondaryMuscles: []string{"quadriceps", "glutes", "Glutes", ""},
	})
	if err != nil {
		t.Fatal(err)
	}
	if e.Name != "Sled Push" || e.MuscleGroup != "quadriceps" || !reflect.DeepEqual(e.SecondaryMuscles, []string{"glutes"}) {
		t.Errorf("created = %+v", e)
	}
	var tax *TaxonomyError
	for field, req := range map[string]models.CreateExerciseRequest{
		"muscle_group":      {Name: "n", MuscleGroup: "pecs"},
		"equipment":         {Name: "n", MuscleGroup: "chest", Equipment: "rope"},
		"category":          {Name: "n", MuscleGroup: "chest", Category: "yoga"},
		"secondary_muscles": {Name: "n", MuscleGroup: "chest", SecondaryMuscles: []string{"wings"}},
	} {
		if _, err := s.CreateCustom(a, req); !errors.As(err, &tax) || tax.Field != field {
			t.Errorf("%s: err = %v", field, err)
		}
	}
}

func TestUpdateCustom(t *testing.T) {
	s, _, a, b := customStore(t)
	e := mustCreate(t, s, a, "Zottman Curl")
	got, err := s.UpdateCustom(a, e.ID, models.CreateExerciseRequest{Name: "Zottman Curls", MuscleGroup: "biceps", Description: "d"})
	if err != nil || got.Name != "Zottman Curls" || got.MuscleGroup != "biceps" || got.Description != "1. d" {
		t.Fatalf("got %+v, %v", got, err)
	}
	if _, err := s.UpdateCustom(b, e.ID, customReq("x")); !errors.Is(err, ErrExerciseNotFound) {
		t.Errorf("other user: %v", err)
	}
	cat := materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))[0]
	if _, err := s.UpdateCustom(a, cat.ID, customReq("x")); !errors.Is(err, ErrNotCustom) {
		t.Errorf("catalog row: %v", err)
	}
}

func TestMaterialize_DoesNotAdoptCustomRowWithSameName(t *testing.T) {
	s, conn, a, _ := customStore(t)
	custom := mustCreate(t, s, a, "Bench Press")
	out := materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))
	if len(out) != 1 || out[0].ID == custom.ID || out[0].IsCustom {
		t.Fatalf("out = %+v, custom id %d", out, custom.ID)
	}
	var oedbID sql.NullString
	conn.QueryRow(`SELECT oedb_id FROM exercises WHERE id = ?`, custom.ID).Scan(&oedbID)
	if oedbID.Valid {
		t.Errorf("custom row adopted oedb id %q", oedbID.String)
	}
	got := mustGet2(t, s, custom.ID, a)
	if got.Name != "Bench Press" || !got.IsCustom || got.MuscleGroup != "chest" {
		t.Errorf("custom row changed: %+v", got)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE owner_user_id IS NULL AND name = 'Bench Press'`); n != 1 {
		t.Errorf("catalog rows = %d", n)
	}
	// The same name arriving again takes the by-name path with a custom row present.
	materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))
}

func mustGet2(t *testing.T, s *ExerciseStore, id, uid int64) models.Exercise {
	t.Helper()
	e, err := s.Get(id, "en", uid)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func TestMaterialize_LegacyRowStillAdoptedByName(t *testing.T) {
	s, conn, a, _ := customStore(t)
	mustCreate(t, s, a, "Bench Press")
	res, _ := conn.Exec(`INSERT INTO exercises (name, muscle_group) VALUES ('Bench Press', 'chest')`)
	legacy, _ := res.LastInsertId()
	out := materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))
	if len(out) != 1 || out[0].ID != legacy {
		t.Fatalf("out = %+v, want legacy id %d", out, legacy)
	}
}

func TestMarkUpstreamMissing_IgnoresCustomRows(t *testing.T) {

	s2, cat2 := syncStore(t, 10, "en")
	for i := 0; i < 20; i++ {
		u := newUser(t, s2.db, fmt.Sprintf("u%d@example.com", i))
		mustCreate(t, s2, u, "Mine")
	}
	// 6 of the 10 held are still listed: fine against 10, but would be refused against 30.
	cat2.setUpstream(6)
	if _, err := s2.syncCatalog(t.Context()); err != nil {
		t.Fatalf("custom rows counted in the held total: %v", err)
	}
	if got := marked(t, s2.db); got != 4 {
		t.Errorf("marked = %d, want 4 catalog rows", got)
	}
	if got := countRows(t, s2.db, `SELECT COUNT(*) FROM exercises WHERE owner_user_id IS NOT NULL AND upstream_missing_at IS NOT NULL`); got != 0 {
		t.Errorf("%d custom rows hidden as removed upstream", got)
	}

	s3, cat3 := syncStore(t, 10, "en")
	mustCreate(t, s3, newUser(t, s3.db, "z@example.com"), "Mine")
	cat3.setUpstream(4)
	if _, err := s3.syncCatalog(t.Context()); !errors.Is(err, ErrCatalogShrank) {
		t.Fatalf("err = %v, want ErrCatalogShrank", err)
	}
}

func TestCount_CatalogRowsOnly(t *testing.T) {
	s, _, a, _ := customStore(t)
	materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))
	mustCreate(t, s, a, "Mine")
	if n, err := s.Count(); err != nil || n != 1 {
		t.Errorf("Count = %d, %v; want 1", n, err)
	}
}

func names(es []models.Exercise) []string {
	out := []string{}
	for _, e := range es {
		out = append(out, e.Name)
	}
	slices.Sort(out)
	return out
}

func TestSearch_MineReturnsOnlyCallersCustomRows(t *testing.T) {
	s, _, a, b := customStore(t)
	materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))
	mustCreate(t, s, a, "Bench Mine")
	mustCreate(t, s, a, "Squat Mine")
	archived := mustCreate(t, s, a, "Bench Old")
	s.Archive(a, archived.ID)
	mustCreate(t, s, b, "Bench Theirs")

	// A catalog that would fail the test if asked: Mine never calls oedb.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("oedb was asked for a Mine search: %s", r.URL)
	}))
	defer srv.Close()
	s.UseCatalog(oedb.New(srv.URL, "test"))

	got, err := s.Search(context.Background(), ExerciseFilter{Mine: true, UserID: a, Query: "bench", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"Bench Mine"}; !reflect.DeepEqual(names(got), want) {
		t.Errorf("got %v, want %v", names(got), want)
	}
	all, _ := s.Search(context.Background(), ExerciseFilter{Mine: true, UserID: a, Limit: 50})
	if want := []string{"Bench Mine", "Squat Mine"}; !reflect.DeepEqual(names(all), want) {
		t.Errorf("got %v, want %v", names(all), want)
	}
}

func TestSearch_CatalogNeverReturnsCustomRows(t *testing.T) {
	s, _, a, _ := customStore(t)
	mustCreate(t, s, a, "Bench Mine")
	materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))

	f := ExerciseFilter{Query: "bench", UserID: a, Limit: 50}
	got, err := s.Search(context.Background(), f) // no catalog configured: the local fallback
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"Bench Press"}; !reflect.DeepEqual(names(got), want) {
		t.Errorf("fallback: got %v, want %v", names(got), want)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"exercises":[{"id":"uuid-1","slug":"bench-press","translation":{"name":"Bench Press","instructions":[]}}],"total":1,"page":1,"per_page":50}`)
	}))
	defer srv.Close()
	s.UseCatalog(oedb.New(srv.URL, "test"))
	got, err = s.Search(context.Background(), f)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"Bench Press"}; !reflect.DeepEqual(names(got), want) {
		t.Errorf("oedb: got %v, want %v", names(got), want)
	}
}

func TestList_HidesOtherUsersCustomRows(t *testing.T) {
	s, _, a, b := customStore(t)
	theirs := mustCreate(t, s, b, "Theirs")
	mine := mustCreate(t, s, a, "Mine")
	for _, f := range []ExerciseFilter{{Limit: 50}, {Limit: 50, UserID: a}, {Limit: 50, UserID: a, Mine: true}} {
		got, err := s.List(f)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range got {
			if e.ID == theirs.ID {
				t.Errorf("%+v listed another user's exercise", f)
			}
		}
	}
	if _, err := s.Get(theirs.ID, "en", a); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("Get of another user's row: %v", err)
	}
	if _, err := s.Get(mine.ID, "en", a); err != nil {
		t.Errorf("Get own: %v", err)
	}
	if _, err := s.Get(mine.ID, "en", b); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("Get as other user: %v", err)
	}
}

func TestMerge_MovesWorkoutAndProgramRowsAndArchives(t *testing.T) {
	s, conn, a, b := customStore(t)
	from := mustCreate(t, s, a, "Old Name")
	into := mustCreate(t, s, a, "New Name")
	w1 := useExercise(t, conn, a, from.ID)
	useExercise(t, conn, a, from.ID)
	// One workout using it twice still counts once.
	conn.Exec(`INSERT INTO workout_exercises (workout_id, exercise_id) VALUES (?, ?)`, w1, from.ID)
	useInProgram(t, conn, a, from.ID)
	// Another user's rows for the same id (reachable only through stale data) are not touched.
	bw := useExercise(t, conn, b, from.ID)

	res, err := s.Merge(a, from.ID, into.ID)
	if err != nil {
		t.Fatal(err)
	}
	if res.MovedWorkouts != 2 || res.MovedProgramDays != 1 || res.Into.ID != into.ID {
		t.Errorf("result = %+v", res)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM workout_exercises WHERE exercise_id = ?`, into.ID); n != 3 {
		t.Errorf("workout rows on target = %d, want 3", n)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM workout_exercises WHERE exercise_id = ? AND workout_id = ?`, from.ID, bw); n != 1 {
		t.Errorf("other user's row moved")
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM program_exercises WHERE exercise_id = ?`, into.ID); n != 1 {
		t.Errorf("program rows on target = %d", n)
	}
	src := mustGet2(t, s, from.ID, a)
	if !src.Archived || src.MergedIntoID == nil || *src.MergedIntoID != into.ID {
		t.Errorf("source = %+v", src)
	}
}

func TestMerge_RefusesCatalogSource(t *testing.T) {
	s, _, a, _ := customStore(t)
	cat := materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))[0]
	mine := mustCreate(t, s, a, "Mine")
	if _, err := s.Merge(a, cat.ID, mine.ID); !errors.Is(err, ErrNotCustom) {
		t.Fatalf("err = %v, want ErrNotCustom", err)
	}
}

func TestMerge_RefusesOtherUsersTarget(t *testing.T) {
	s, _, a, b := customStore(t)
	mine := mustCreate(t, s, a, "Mine")
	theirs := mustCreate(t, s, b, "Theirs")
	if _, err := s.Merge(a, mine.ID, theirs.ID); !errors.Is(err, ErrInvalidMergeTarget) {
		t.Fatalf("err = %v, want ErrInvalidMergeTarget", err)
	}
	if _, err := s.Merge(b, mine.ID, theirs.ID); !errors.Is(err, ErrExerciseNotFound) {
		t.Fatalf("other user's source: err = %v, want ErrExerciseNotFound", err)
	}
	if _, err := s.Merge(a, mine.ID, mine.ID); !errors.Is(err, ErrInvalidMergeTarget) {
		t.Fatalf("self: %v", err)
	}
	if _, err := s.Merge(a, mine.ID, 99999); !errors.Is(err, ErrInvalidMergeTarget) {
		t.Fatalf("missing target: %v", err)
	}
	old := mustCreate(t, s, a, "Old")
	s.Archive(a, old.ID)
	if _, err := s.Merge(a, mine.ID, old.ID); !errors.Is(err, ErrInvalidMergeTarget) {
		t.Fatalf("archived target: %v", err)
	}
	if got := mustGet2(t, s, mine.ID, a); got.Archived {
		t.Error("a refused merge archived the source")
	}
}

func TestMerge_CatalogTargetAllowed(t *testing.T) {
	s, conn, a, _ := customStore(t)
	cat := materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))[0]
	mine := mustCreate(t, s, a, "Mine")
	useExercise(t, conn, a, mine.ID)
	res, err := s.Merge(a, mine.ID, cat.ID)
	if err != nil || res.MovedWorkouts != 1 || res.Into.IsCustom {
		t.Fatalf("res = %+v, %v", res, err)
	}
}

func TestUsage(t *testing.T) {
	s, conn, a, b := customStore(t)
	e := mustCreate(t, s, a, "Mine")
	useExercise(t, conn, a, e.ID)
	useInProgram(t, conn, a, e.ID)
	u, err := s.Usage(a, e.ID, 0)
	if err != nil || u.Workouts != 1 || u.ProgramDays != 1 {
		t.Fatalf("usage = %+v, %v", u, err)
	}
	if _, err := s.Usage(b, e.ID, 0); !errors.Is(err, ErrExerciseNotFound) {
		t.Errorf("other user: %v", err)
	}
	// A missing id answers like another user's, so the endpoint is no oracle for which ids are custom.
	if _, err := s.Usage(a, 999999, 0); !errors.Is(err, ErrExerciseNotFound) {
		t.Errorf("missing id: %v", err)
	}
}

func TestArchive_KeepsHistoryReadable(t *testing.T) {
	s, conn, a, _ := customStore(t)
	e := mustCreate(t, s, a, "Mine")
	wid := useExercise(t, conn, a, e.ID)
	got, err := s.Archive(a, e.ID)
	if err != nil || !got.Archived {
		t.Fatalf("archive: %+v, %v", got, err)
	}
	if again, err := s.Archive(a, e.ID); err != nil || !again.Archived {
		t.Fatalf("second archive must be a no-op: %+v, %v", again, err)
	}
	ws := NewWorkoutStore(conn)
	w, err := ws.Get(a, wid, "en")
	if err != nil || len(w.Exercises) != 1 || w.Exercises[0].Exercise.Name != "Mine" || !w.Exercises[0].Exercise.IsCustom {
		t.Fatalf("workout after archive: %+v, %v", w.Exercises, err)
	}
	list, _ := s.List(ExerciseFilter{Mine: true, UserID: a, Limit: 50})
	if len(list) != 0 {
		t.Errorf("archived row listed: %v", names(list))
	}
	back, err := s.Unarchive(a, e.ID)
	if err != nil || back.Archived || back.MergedIntoID != nil {
		t.Fatalf("unarchive: %+v, %v", back, err)
	}
}

func TestVisibleTo(t *testing.T) {
	s, _, a, b := customStore(t)
	cat := materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))[0]
	mine := mustCreate(t, s, a, "Mine")
	theirs := mustCreate(t, s, b, "Theirs")
	archived := mustCreate(t, s, a, "Old")
	s.Archive(a, archived.ID)

	if err := s.VisibleTo(a, []int64{cat.ID, mine.ID, archived.ID, 99999}); err != nil {
		t.Errorf("visible ids: %v", err)
	}
	if err := s.VisibleTo(a, []int64{cat.ID, theirs.ID}); !errors.Is(err, ErrExerciseNotVisible) {
		t.Errorf("other user's id: %v", err)
	}
	if err := s.VisibleTo(a, nil); err != nil {
		t.Errorf("empty: %v", err)
	}
}

func TestUserDelete_RemovesUnreferencedCustomExercises(t *testing.T) {
	s, conn, a, b := customStore(t)
	mustCreate(t, s, a, "Mine")
	used := mustCreate(t, s, a, "Used")
	useExercise(t, conn, a, used.ID)
	keep := mustCreate(t, s, b, "Keep")
	cat := materialize(t, s, "en", catalogExercise("uuid-1", "Bench Press"))[0]

	if err := NewUserStore(conn).Delete(a); err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE owner_user_id = ?`, a); n != 0 {
		t.Errorf("%d custom exercises left", n)
	}
	for _, id := range []int64{keep.ID, cat.ID} {
		if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises WHERE id = ?`, id); n != 1 {
			t.Errorf("exercise %d was deleted", id)
		}
	}
}

// dayWith builds one program day for uid holding the given blocks in order; each block is
// (exercise id, set count, superset group or 0, notes). It returns the day id and block ids.
func dayWith(t *testing.T, conn *sql.DB, uid int64, blocks ...[4]any) (int64, []int64) {
	t.Helper()
	res, err := conn.Exec(`INSERT INTO programs (user_id, name) VALUES (?, 'p')`, uid)
	if err != nil {
		t.Fatal(err)
	}
	pid, _ := res.LastInsertId()
	res, err = conn.Exec(`INSERT INTO program_days (program_id, name, order_index) VALUES (?, 'd', 0)`, pid)
	if err != nil {
		t.Fatal(err)
	}
	did, _ := res.LastInsertId()
	var ids []int64
	for i, b := range blocks {
		var group any
		if g := b[2].(int); g != 0 {
			group = g
		}
		res, err := conn.Exec(`INSERT INTO program_exercises (program_id, program_day_id, exercise_id, order_index, superset_group, notes)
			VALUES (?, ?, ?, ?, ?, ?)`, pid, did, b[0], i, group, b[3])
		if err != nil {
			t.Fatal(err)
		}
		id, _ := res.LastInsertId()
		ids = append(ids, id)
		for n := 1; n <= b[1].(int); n++ {
			if _, err := conn.Exec(`INSERT INTO program_sets (program_exercise_id, set_number, target_reps, target_weight) VALUES (?, ?, ?, ?)`,
				id, n, 10*(i+1)+n, 0); err != nil {
				t.Fatal(err)
			}
		}
	}
	return did, ids
}

func TestMerge_CombinesADayThatListsBoth(t *testing.T) {
	s, conn, a, _ := customStore(t)
	from := mustCreate(t, s, a, "Old Press")
	into := mustCreate(t, s, a, "Press")
	other := mustCreate(t, s, a, "Row")
	// Press (2 sets, no notes) · Row · Old Press (3 sets, "slow", in a superset with Row).
	day, ids := dayWith(t, conn, a,
		[4]any{into.ID, 2, 0, ""}, [4]any{other.ID, 1, 7, ""}, [4]any{from.ID, 3, 7, "slow"})
	// A day with only the old one: renamed, nothing to combine.
	plain, _ := dayWith(t, conn, a, [4]any{from.ID, 2, 0, ""})

	res, err := s.Merge(a, from.ID, into.ID)
	if err != nil {
		t.Fatal(err)
	}
	if res.MovedProgramDays != 2 || res.CombinedProgramDays != 1 {
		t.Errorf("result = %+v, want 2 moved and 1 combined", res)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM program_exercises WHERE program_day_id = ? AND exercise_id = ?`, day, into.ID); n != 1 {
		t.Fatalf("Press listed %d times on the day, want once", n)
	}
	var reps []int
	rows, _ := conn.Query(`SELECT target_reps FROM program_sets WHERE program_exercise_id = ? ORDER BY set_number`, ids[0])
	for rows.Next() {
		var r int
		rows.Scan(&r)
		reps = append(reps, r)
	}
	rows.Close()
	// The kept block's own sets first, then the merged one's, numbered on from them.
	if want := []int{11, 12, 31, 32, 33}; !reflect.DeepEqual(reps, want) {
		t.Errorf("sets by number = %v, want %v", reps, want)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM program_sets WHERE program_exercise_id = ? AND set_number BETWEEN 1 AND 5`, ids[0]); n != 5 {
		t.Errorf("set numbers not 1..5")
	}
	var notes string
	conn.QueryRow(`SELECT notes FROM program_exercises WHERE id = ?`, ids[0]).Scan(&notes)
	if notes != "slow" {
		t.Errorf("notes = %q: an empty note takes the merged block's", notes)
	}
	// Row is left alone in a superset of one: that is no superset.
	var group sql.NullInt64
	var order int
	conn.QueryRow(`SELECT superset_group, order_index FROM program_exercises WHERE id = ?`, ids[1]).Scan(&group, &order)
	if group.Valid {
		t.Errorf("Row still in superset %d with no partner", group.Int64)
	}
	if order != 1 {
		t.Errorf("Row order_index = %d, want 1 (no gap)", order)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM program_exercises WHERE program_day_id = ? AND exercise_id = ?`, plain, into.ID); n != 1 {
		t.Errorf("plain day: Press listed %d times", n)
	}
}

func TestMerge_LeavesTwoBlocksInALoggedWorkout(t *testing.T) {
	s, conn, a, _ := customStore(t)
	from := mustCreate(t, s, a, "Old Press")
	into := mustCreate(t, s, a, "Press")
	w := useExercise(t, conn, a, into.ID)
	conn.Exec(`INSERT INTO workout_exercises (workout_id, exercise_id) VALUES (?, ?)`, w, from.ID)
	if _, err := s.Merge(a, from.ID, into.ID); err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM workout_exercises WHERE workout_id = ? AND exercise_id = ?`, w, into.ID); n != 2 {
		t.Errorf("logged workout has %d Press blocks, want 2 (a record of what was done)", n)
	}
}

func TestUsage_CountsDaysThatListBothForATarget(t *testing.T) {
	s, conn, a, _ := customStore(t)
	from := mustCreate(t, s, a, "Old Press")
	into := mustCreate(t, s, a, "Press")
	dayWith(t, conn, a, [4]any{into.ID, 1, 0, ""}, [4]any{from.ID, 1, 0, ""})
	dayWith(t, conn, a, [4]any{from.ID, 1, 0, ""})
	u, err := s.Usage(a, from.ID, into.ID)
	if err != nil {
		t.Fatal(err)
	}
	if u.ProgramDays != 2 || u.SharedProgramDays != 1 {
		t.Errorf("usage = %+v, want 2 days and 1 shared", u)
	}
	if u, _ := s.Usage(a, from.ID, 0); u.SharedProgramDays != 0 {
		t.Errorf("without a target: %+v", u)
	}
}

package stores

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/oedb"
)

const imageBase = "https://oedb.test"

// served builds an oedb row whose name and instructions came back in the given
// locales, which is what a localized read of the real catalog returns.
func served(id, name, nameLocale string, steps []string, stepsLocale string) oedb.Exercise {
	ex := catalogExercise(id, name)
	ex.Translation.NameLocale = nameLocale
	ex.Translation.Instructions = steps
	ex.Translation.InstructionsLocale = stepsLocale
	return ex
}

func englishSquat() oedb.Exercise {
	return served("uuid-1", "Squat", "en", []string{"Stand tall.", "Sit down."}, "en")
}

func spanishSquat() oedb.Exercise {
	return served("uuid-1", "Sentadilla", "es", []string{"Ponte recto.", "Siéntate."}, "es")
}

func materialize(t *testing.T, s *ExerciseStore, locale string, items ...oedb.Exercise) []models.Exercise {
	t.Helper()
	out, err := s.Materialize(items, imageBase, locale)
	if err != nil {
		t.Fatalf("Materialize(%q): %v", locale, err)
	}
	return out
}

func mustGet(t *testing.T, s *ExerciseStore, id int64, locale string) models.Exercise {
	t.Helper()
	e, err := s.Get(id, locale)
	if err != nil {
		t.Fatalf("Get(%d, %q): %v", id, locale, err)
	}
	return e
}

func countRows(t *testing.T, conn *sql.DB, query string, args ...any) int {
	t.Helper()
	var n int
	if err := conn.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

func TestNormalizeLocale(t *testing.T) {
	cases := map[string]string{
		"es":                            "es",
		"ES":                            "es",
		"es-mx":                         "es-MX",
		" pt-br ":                       "pt-BR",
		"zh-hant":                       "zh-HANT",
		"en-gb":                         "en-GB",
		"":                              "en",
		"   ":                           "en",
		"!!":                            "en",
		"e":                             "en",
		"es_ES":                         "en",
		"es-":                           "en",
		"-es":                           "en",
		"es--MX":                        "en",
		"1s":                            "en",
		strings.Repeat("a", 36):         "en",
		strings.Repeat("a", 200):        "en",
		"es-" + strings.Repeat("x", 40): "en",
	}
	for in, want := range cases {
		if got := NormalizeLocale(in); got != want {
			t.Errorf("NormalizeLocale(%q) = %q, want %q", in, got, want)
		}
		if again := NormalizeLocale(want); again != want {
			t.Errorf("NormalizeLocale is not idempotent: %q -> %q", want, again)
		}
	}
}

func TestMaterialize_LocalizedFetchKeepsEnglishBase(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	base := materialize(t, s, "en", englishSquat())
	out := materialize(t, s, "es", spanishSquat())

	if out[0].Name != "Sentadilla" {
		t.Errorf("returned name = %q, want the Spanish one", out[0].Name)
	}
	if out[0].ID != base[0].ID {
		t.Errorf("localized fetch changed the row id: %d != %d", out[0].ID, base[0].ID)
	}

	var name, desc string
	conn.QueryRow(`SELECT name, description FROM exercises WHERE id = ?`, base[0].ID).Scan(&name, &desc)
	if name != "Squat" || desc != "1. Stand tall.\n2. Sit down." {
		t.Errorf("base row = (%q, %q), want it still English", name, desc)
	}

	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercise_translations`); n != 1 {
		t.Fatalf("translation rows = %d, want 1", n)
	}
	var tl, tn, td, origin string
	conn.QueryRow(`SELECT locale, name, description, origin FROM exercise_translations`).Scan(&tl, &tn, &td, &origin)
	if tl != "es" || tn != "Sentadilla" || td != "1. Ponte recto.\n2. Siéntate." || origin != "human" {
		t.Errorf("translation = (%q, %q, %q, %q)", tl, tn, td, origin)
	}

	reads := map[string]string{"en": "Squat", "": "Squat", "fr": "Squat", "es": "Sentadilla", "es-MX": "Sentadilla", "ES-mx": "Sentadilla", "!!": "Squat"}
	for locale, want := range reads {
		if got := mustGet(t, s, base[0].ID, locale).Name; got != want {
			t.Errorf("Get(%q).Name = %q, want %q", locale, got, want)
		}
	}
}

func TestMaterialize_RegionalRequestStoresServedLocale(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	base := materialize(t, s, "en", englishSquat())

	// es-MX was asked for, oedb answered with its es text.
	materialize(t, s, "es-MX", spanishSquat())

	var tl string
	conn.QueryRow(`SELECT locale FROM exercise_translations`).Scan(&tl)
	if tl != "es" {
		t.Errorf("stored locale = %q, want the served es", tl)
	}
	if got := mustGet(t, s, base[0].ID, "es-MX").Name; got != "Sentadilla" {
		t.Errorf("es-MX read = %q, want the es fallback", got)
	}
}

func TestMaterialize_PerFieldFallback(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	base := materialize(t, s, "en", englishSquat())

	// Name translated, instructions fell back to English (and were edited upstream).
	materialize(t, s, "es", served("uuid-1", "Sentadilla", "es", []string{"Stand tall.", "Sit lower."}, "en"))

	var tn, td string
	conn.QueryRow(`SELECT name, description FROM exercise_translations`).Scan(&tn, &td)
	if tn != "Sentadilla" || td != "" {
		t.Errorf("translation = (%q, %q), want the name only", tn, td)
	}
	got := mustGet(t, s, base[0].ID, "es")
	if got.Name != "Sentadilla" || got.Description != "1. Stand tall.\n2. Sit lower." {
		t.Errorf("es read = (%q, %q), want Spanish name and refreshed English description", got.Name, got.Description)
	}
	if en := mustGet(t, s, base[0].ID, "en"); en.Name != "Squat" {
		t.Errorf("en name = %q", en.Name)
	}

	// The opposite case: name fell back, instructions translated.
	materialize(t, s, "es", served("uuid-1", "Squat", "en", []string{"Ponte recto."}, "es"))
	got = mustGet(t, s, base[0].ID, "es")
	if got.Name != "Squat" || got.Description != "1. Ponte recto." {
		t.Errorf("es read = (%q, %q), want English name and Spanish description", got.Name, got.Description)
	}
	if en := mustGet(t, s, base[0].ID, "en"); en.Description != "1. Stand tall.\n2. Sit lower." {
		t.Errorf("en description = %q, want the base left alone", en.Description)
	}
}

func TestMaterialize_UntranslatedLocalizedFetchDeletesStaleRow(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	base := materialize(t, s, "en", englishSquat())
	materialize(t, s, "es", spanishSquat())

	edited := served("uuid-1", "Squat", "en", []string{"Stand tall.", "Sit lower."}, "en")
	out := materialize(t, s, "es", edited)

	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercise_translations`); n != 0 {
		t.Errorf("translation rows = %d, want the stale one removed", n)
	}
	if out[0].Name != "Squat" || out[0].Description != "1. Stand tall.\n2. Sit lower." {
		t.Errorf("returned = (%q, %q)", out[0].Name, out[0].Description)
	}
	if got := mustGet(t, s, base[0].ID, "es"); got.Name != "Squat" {
		t.Errorf("es read = %q, want English once the translation is gone", got.Name)
	}
}

func TestMaterialize_OnlyReplacesItsOwnLocales(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	base := materialize(t, s, "en", englishSquat())
	materialize(t, s, "es", spanishSquat())
	materialize(t, s, "fr", served("uuid-1", "Squat (fr)", "fr", []string{"Debout."}, "fr"))

	materialize(t, s, "es", englishSquat())

	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercise_translations WHERE locale = 'fr'`); n != 1 {
		t.Errorf("fr rows = %d, want the es fetch to leave them alone", n)
	}
	if got := mustGet(t, s, base[0].ID, "fr").Name; got != "Squat (fr)" {
		t.Errorf("fr read = %q", got)
	}
}

func TestMaterialize_SkipsTranslatedItemWithNoEnglishBase(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	out, err := s.Materialize([]oedb.Exercise{spanishSquat()}, imageBase, "es")
	if err != nil {
		t.Fatalf("Materialize: %v", err)
	}
	if len(out) != 0 {
		t.Errorf("returned %d rows, want the translated item left out", len(out))
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises`); n != 0 {
		t.Errorf("exercises = %d, want no English base invented from Spanish text", n)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercise_translations`); n != 0 {
		t.Errorf("translations = %d, want nothing written", n)
	}
}

func TestMaterialize_SkippedTranslatedItemKeepsTheRestOfTheBatch(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	other := served("uuid-2", "Deadlift", "en", []string{"Lift."}, "en")
	out, err := s.Materialize([]oedb.Exercise{other, spanishSquat()}, imageBase, "es")
	if err != nil {
		t.Fatalf("Materialize: %v", err)
	}
	if len(out) != 1 || out[0].Name != "Deadlift" {
		t.Errorf("returned %+v, want only Deadlift", out)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises`); n != 1 {
		t.Errorf("exercises = %d, want 1", n)
	}
}

func TestMaterialize_MachineOrigin(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	materialize(t, s, "en", englishSquat())

	machine := spanishSquat()
	machine.Translation.NameMachineOrigin = true
	materialize(t, s, "es", machine)

	var origin string
	conn.QueryRow(`SELECT origin FROM exercise_translations`).Scan(&origin)
	if origin != "machine" {
		t.Errorf("origin = %q, want machine", origin)
	}

	// A machine flag on a field that fell back to English does not count.
	fellBack := served("uuid-1", "Sentadilla", "es", []string{"Stand tall."}, "en")
	fellBack.Translation.InstructionsMachineOrigin = true
	materialize(t, s, "es", fellBack)
	conn.QueryRow(`SELECT origin FROM exercise_translations`).Scan(&origin)
	if origin != "human" {
		t.Errorf("origin = %q, want human", origin)
	}
}

func TestMaterialize_OlderOedbWithoutLocaleFieldsIsEnglish(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)

	out := materialize(t, s, "es", catalogExercise("uuid-1", "Squat"))
	if out[0].Name != "Squat" {
		t.Errorf("name = %q", out[0].Name)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercise_translations`); n != 0 {
		t.Errorf("translations = %d, want none", n)
	}
}

func TestUserCreatedRowNeverLocalized(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	res, err := conn.Exec(`INSERT INTO exercises (name, muscle_group, category) VALUES ('My Thing', 'chest', 'strength')`)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()

	materialize(t, s, "en", englishSquat())
	materialize(t, s, "es", spanishSquat())
	for _, locale := range []string{"es", "fr", "en", ""} {
		if got := mustGet(t, s, id, locale).Name; got != "My Thing" {
			t.Errorf("Get(%q).Name = %q, want the name as typed", locale, got)
		}
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercise_translations WHERE exercise_id = ?`, id); n != 0 {
		t.Errorf("translations = %d, want none for a row with no oedb_id", n)
	}
}

func TestList_LocalSearchCoversTranslationAndEnglish(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	materialize(t, s, "en", englishSquat(), served("uuid-2", "Bench Press", "en", []string{"Press."}, "en"), served("uuid-3", "Curl", "en", []string{"Curl."}, "en"))
	materialize(t, s, "es", spanishSquat())
	materialize(t, s, "es", served("uuid-3", "Flexión de bíceps", "es", []string{"Flexiona."}, "es"))

	names := func(q, locale string) []string {
		t.Helper()
		list, err := s.List(ExerciseFilter{Query: q, Locale: locale, Limit: 50})
		if err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, e := range list {
			out = append(out, e.Name)
		}
		return out
	}
	eq := func(got []string, want ...string) {
		t.Helper()
		if strings.Join(got, "|") != strings.Join(want, "|") {
			t.Errorf("got %v, want %v", got, want)
		}
	}

	eq(names("sentadilla", "es"), "Sentadilla")
	eq(names("sentadilla", "es-MX"), "Sentadilla")
	eq(names("sentadilla", "en"))
	eq(names("sentadilla", "fr"))
	eq(names("squat", "es"), "Sentadilla")
	eq(names("squat", "en"), "Squat")
	// Ordered by the name the reader sees: Bench Press, Flexión..., Sentadilla.
	eq(names("", "es"), "Bench Press", "Flexión de bíceps", "Sentadilla")
	eq(names("", "en"), "Bench Press", "Curl", "Squat")
}

func TestClearUnreferenced_CascadesTranslations(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	materialize(t, s, "en", englishSquat(), served("uuid-2", "Deadlift", "en", []string{"Lift."}, "en"))
	materialize(t, s, "es", spanishSquat())
	materialize(t, s, "es", served("uuid-2", "Peso muerto", "es", []string{"Levanta."}, "es"))

	uid := seedUser(t, conn)
	var keep int64
	conn.QueryRow(`SELECT id FROM exercises WHERE oedb_id = 'uuid-2'`).Scan(&keep)
	pid := seedProgram(t, conn, uid, keep)
	_ = pid

	n, err := s.ClearUnreferenced()
	if err != nil {
		t.Fatalf("ClearUnreferenced: %v", err)
	}
	if n != 1 {
		t.Errorf("deleted %d, want the one unreferenced exercise", n)
	}
	if c := countRows(t, conn, `SELECT COUNT(*) FROM exercise_translations`); c != 1 {
		t.Errorf("translation rows = %d, want only the referenced exercise's", c)
	}
	if c := countRows(t, conn, `SELECT COUNT(*) FROM exercise_translations WHERE exercise_id = ?`, keep); c != 1 {
		t.Errorf("the referenced exercise lost its translation")
	}
}

func seedUser(t *testing.T, conn *sql.DB) int64 {
	t.Helper()
	res, err := conn.Exec(`INSERT INTO users (email, password_hash) VALUES ('loc@example.com', 'x')`)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

// seedProgram stores a one-exercise routine directly, bypassing the stores under test.
func seedProgram(t *testing.T, conn *sql.DB, uid, exerciseID int64) int64 {
	t.Helper()
	res, err := conn.Exec(`INSERT INTO programs (user_id, name) VALUES (?, 'P')`, uid)
	if err != nil {
		t.Fatal(err)
	}
	pid, _ := res.LastInsertId()
	res, err = conn.Exec(`INSERT INTO program_days (program_id, order_index, name) VALUES (?, 0, 'D')`, pid)
	if err != nil {
		t.Fatal(err)
	}
	did, _ := res.LastInsertId()
	if _, err := conn.Exec(`INSERT INTO program_exercises (program_id, program_day_id, exercise_id, order_index) VALUES (?, ?, ?, 0)`, pid, did, exerciseID); err != nil {
		t.Fatal(err)
	}
	return pid
}

func TestWorkoutAndProgramReadsResolveLocale(t *testing.T) {
	conn := testDB(t)
	st := New(conn)
	base := materialize(t, st.Exercise, "en", englishSquat())
	materialize(t, st.Exercise, "es", spanishSquat())
	exID := base[0].ID
	uid := seedUser(t, conn)

	workoutName := func(w models.Workout) string { return w.Exercises[0].Exercise.Name }
	programName := func(p models.Program) string { return p.Days[0].Exercises[0].Exercise.Name }
	check := func(what, locale, got, want string) {
		t.Helper()
		if got != want {
			t.Errorf("%s (%q) = %q, want %q", what, locale, got, want)
		}
	}

	wreq := models.CreateWorkoutRequest{
		Name:      "W",
		StartedAt: time.Now(),
		Exercises: []models.CreateWorkoutExerciseReq{{ExerciseID: exID, Sets: []models.CreateSetReq{{SetNumber: 1, Reps: 5, Weight: 100}}}},
	}
	preq := models.CreateProgramRequest{
		Name: "P",
		Days: []models.CreateProgramDayReq{{Name: "D", Exercises: []models.CreateProgramExerciseReq{
			{ExerciseID: exID, Sets: []models.CreateProgramSetReq{{SetNumber: 1, TargetReps: 5, TargetWeight: 100}}},
		}}},
	}

	for locale, want := range map[string]string{"es": "Sentadilla", "es-MX": "Sentadilla", "en": "Squat", "": "Squat"} {
		w, _, err := st.CreateWorkoutWithProgression(uid, wreq, locale)
		if err != nil {
			t.Fatal(err)
		}
		check("CreateWorkoutWithProgression", locale, workoutName(w), want)

		got, err := st.Workout.Get(uid, w.ID, locale)
		if err != nil {
			t.Fatal(err)
		}
		check("Workout.Get", locale, workoutName(got), want)

		list, err := st.Workout.List(uid, WorkoutFilter{Limit: 50}, locale)
		if err != nil {
			t.Fatal(err)
		}
		for _, lw := range list {
			check("Workout.List", locale, workoutName(lw), want)
		}

		upd, err := st.Workout.Update(uid, w.ID, wreq, locale)
		if err != nil {
			t.Fatal(err)
		}
		check("Workout.Update", locale, workoutName(upd), want)

		p, err := st.Program.Create(uid, preq, locale)
		if err != nil {
			t.Fatal(err)
		}
		check("Program.Create", locale, programName(p), want)

		gp, err := st.Program.Get(uid, p.ID, locale)
		if err != nil {
			t.Fatal(err)
		}
		check("Program.Get", locale, programName(gp), want)

		plist, err := st.Program.List(uid, ProgramFilter{Limit: 50}, locale)
		if err != nil {
			t.Fatal(err)
		}
		for _, lp := range plist {
			check("Program.List", locale, programName(lp), want)
		}

		preq.DayIDsKnown = true
		preq.Days[0].ID = gp.Days[0].ID
		up, err := st.Program.Update(uid, p.ID, preq, locale)
		if err != nil {
			t.Fatal(err)
		}
		check("Program.Update", locale, programName(up), want)

		rp, err := st.Program.ResolveSuggestions(uid, p.ID, nil, nil, locale)
		if err != nil {
			t.Fatal(err)
		}
		check("Program.ResolveSuggestions", locale, programName(rp), want)
		preq.DayIDsKnown, preq.Days[0].ID = false, 0
	}
}

// fakeOEDB serves the catalog the way the real one does for this test's single
// exercise, and records every request URL.
type fakeOEDB struct {
	mu   sync.Mutex
	urls []string
	srv  *httptest.Server
}

func newFakeOEDB(t *testing.T, handle func(w http.ResponseWriter, r *http.Request)) *fakeOEDB {
	t.Helper()
	f := &fakeOEDB{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.urls = append(f.urls, r.URL.RequestURI())
		f.mu.Unlock()
		handle(w, r)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeOEDB) requests() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.urls...)
}

func TestSearch_LocalizedCatalogQuery(t *testing.T) {
	f := newFakeOEDB(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		switch {
		case q.Get("locale") == "es":
			fmt.Fprint(w, `{"exercises":[{"id":"uuid-1","slug":"squat","muscle_group":"legs",
				"translation":{"name":"Sentadilla","instructions":["Ponte recto."],"name_locale":"es","instructions_locale":"es"}}],"total":1}`)
		case q.Get("ids") == "uuid-1":
			fmt.Fprint(w, `{"exercises":[{"id":"uuid-1","slug":"squat","muscle_group":"legs",
				"translation":{"name":"Squat","instructions":["Stand tall."],"name_locale":"en","instructions_locale":"en"}}],"total":1}`)
		default:
			fmt.Fprint(w, `{"exercises":[{"id":"uuid-1","slug":"squat","muscle_group":"legs",
				"translation":{"name":"Squat","instructions":["Stand tall."],"name_locale":"en","instructions_locale":"en"}}],"total":1}`)
		}
	})
	conn := testDB(t)
	s := NewExerciseStore(conn)
	s.UseCatalog(oedb.New(f.srv.URL, "test"))

	es, err := s.Search(context.Background(), ExerciseFilter{Query: "sentadilla", Locale: "es", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(es) != 1 || es[0].Name != "Sentadilla" {
		t.Fatalf("es results = %+v, want the Spanish name", es)
	}

	var sawList, sawIDs bool
	for _, u := range f.requests() {
		if strings.Contains(u, "locale=es") && strings.Contains(u, "q=sentadilla") {
			sawList = true
		}
		if strings.Contains(u, "ids=uuid-1") {
			sawIDs = true
			if strings.Contains(u, "locale=") {
				t.Errorf("the base-row fetch carried a locale: %s", u)
			}
		}
	}
	if !sawList || !sawIDs {
		t.Errorf("requests = %v, want a localized list and an ids fetch for the unseen exercise", f.requests())
	}

	en, err := s.Search(context.Background(), ExerciseFilter{Query: "squat", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(en) != 1 || en[0].Name != "Squat" || en[0].ID != es[0].ID {
		t.Fatalf("en results = %+v, want the same row in English: the shared row was never overwritten", en)
	}
	for _, u := range f.requests()[len(f.requests())-1:] {
		if strings.Contains(u, "locale=") {
			t.Errorf("an English search sent a locale: %s", u)
		}
	}
}

func TestSearch_FallsBackWhenEnglishBaseCannotBeFetched(t *testing.T) {
	f := newFakeOEDB(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("ids") != "" {
			http.Error(w, `{"error":"unknown filter"}`, http.StatusUnprocessableEntity)
			return
		}
		fmt.Fprint(w, `{"exercises":[{"id":"uuid-1","slug":"squat",
			"translation":{"name":"Sentadilla","instructions":[],"name_locale":"es","instructions_locale":"es"}}],"total":1}`)
	})
	conn := testDB(t)
	s := NewExerciseStore(conn)
	s.UseCatalog(oedb.New(f.srv.URL, "test"))

	out, err := s.Search(context.Background(), ExerciseFilter{Query: "sentadilla", Locale: "es", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 0 {
		t.Errorf("results = %+v, want the (empty) local snapshot", out)
	}
	if n := countRows(t, conn, `SELECT COUNT(*) FROM exercises`); n != 0 {
		t.Errorf("exercises = %d, a translated name was inserted as a base", n)
	}
}

func TestSearch_NonEnglishBulkSkipsExport(t *testing.T) {
	f := newFakeOEDB(t, func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"exercises":[],"total":0}`)
	})
	s := NewExerciseStore(testDB(t))
	s.UseCatalog(oedb.New(f.srv.URL, "test"))

	if _, err := s.Search(context.Background(), ExerciseFilter{Limit: 500, Locale: "es"}); err != nil {
		t.Fatal(err)
	}
	for _, u := range f.requests() {
		if strings.Contains(u, "/exercises/export") {
			t.Errorf("a Spanish bulk read used the export: %s", u)
		}
		if !strings.Contains(u, "locale=es") {
			t.Errorf("list request without the locale: %s", u)
		}
	}
	if len(f.requests()) == 0 {
		t.Fatal("no request made")
	}

	if _, err := s.Search(context.Background(), ExerciseFilter{Limit: 500, Locale: "EN"}); err != nil {
		t.Fatal(err)
	}
	last := f.requests()[len(f.requests())-1]
	if !strings.Contains(last, "/exercises/export") {
		t.Errorf("an English bulk read left the export: %s", last)
	}
}

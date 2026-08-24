package db

import (
	"database/sql"
	"fmt"
	"math/rand"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// setupMigrationTestDB points the package-level DB at a fresh in-memory sqlite and
// runs the base schema (but NOT alterMigrations — callers seed pre-migration rows in
// between the two, same as a real upgrade of an existing database). Foreign keys are
// on, matching the production DSN — the program_day_id ON DELETE SET NULL behavior
// under test only exists with them enforced.
func setupMigrationTestDB(t *testing.T) {
	t.Helper()
	name := fmt.Sprintf("file:migtestdb_%d?mode=memory&cache=shared&_pragma=foreign_keys(on)", rand.Int63())
	conn, err := sql.Open("sqlite", name)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	DB = conn
	if err := migrate(); err != nil {
		t.Fatalf("apply base schema: %v", err)
	}
}

// TestMultiDayProgramsMigration_WrapsExerciselessProgram is the regression check for
// the review finding: a pre-existing program with zero program_exercises rows (a
// valid state under the old flat model) must still come out of the migration with
// exactly one auto-created wrapper Day, not zero Days.
func TestMultiDayProgramsMigration_WrapsExerciselessProgram(t *testing.T) {
	setupMigrationTestDB(t)

	res, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('mig@example.com', 'x')`)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	uid, _ := res.LastInsertId()
	res, err = DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, 'Empty Routine')`, uid)
	if err != nil {
		t.Fatalf("seed program: %v", err)
	}
	pid, _ := res.LastInsertId()

	multiDayProgramsMigration()

	var count int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM program_days WHERE program_id = ?`, pid).Scan(&count); err != nil {
		t.Fatalf("count program_days: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected the exerciseless program to get exactly 1 wrapper Day, got %d", count)
	}
	var orderIndex, isRest int
	if err := DB.QueryRow(`SELECT order_index, is_rest_day FROM program_days WHERE program_id = ?`, pid).
		Scan(&orderIndex, &isRest); err != nil {
		t.Fatalf("read wrapper day: %v", err)
	}
	if orderIndex != 0 || isRest != 0 {
		t.Fatalf("expected wrapper day order_index=0 is_rest_day=0, got order_index=%d is_rest_day=%d", orderIndex, isRest)
	}
}

// TestMultiDayProgramsMigration_IsIdempotent running it twice must not create a
// second wrapper Day for a program that already has one (matches the real boot path,
// where alterMigrations runs on every startup).
func TestMultiDayProgramsMigration_IsIdempotent(t *testing.T) {
	setupMigrationTestDB(t)

	res, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('mig2@example.com', 'x')`)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	uid, _ := res.LastInsertId()
	res, err = DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, 'Routine')`, uid)
	if err != nil {
		t.Fatalf("seed program: %v", err)
	}
	pid, _ := res.LastInsertId()

	multiDayProgramsMigration()
	multiDayProgramsMigration()

	var count int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM program_days WHERE program_id = ?`, pid).Scan(&count); err != nil {
		t.Fatalf("count program_days: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 wrapper Day after running the migration twice, got %d", count)
	}
}

func countRow(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	if err := DB.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("count %q: %v", query, err)
	}
	return n
}

// TestUpgradeFromPreDayStructureDeployment simulates upgrading a REAL older install
// straight to HEAD: the base schema plus the progressive-overload (#40) columns is
// exactly what a deployment running #40 but predating the multi-day rework had on
// disk. Seed old-shape user data — a flat program with exercises, an UNRESOLVED
// staged suggestion, logged workout history — then run the full alterMigrations()
// sequence (the multi-day rework AND the program_day_id fix in one boot) and assert
// zero data loss.
func TestUpgradeFromPreDayStructureDeployment(t *testing.T) {
	setupMigrationTestDB(t)
	// The #40-era columns that deployment already had (same ensureColumn calls its
	// boots ran).
	ensureColumn("program_sets", "suggested_weight", `ALTER TABLE program_sets ADD COLUMN suggested_weight REAL`)
	ensureColumn("program_sets", "suggested_reps", `ALTER TABLE program_sets ADD COLUMN suggested_reps INTEGER`)
	ensureColumn("program_sets", "suggested_is_pr", `ALTER TABLE program_sets ADD COLUMN suggested_is_pr INTEGER NOT NULL DEFAULT 0`)

	if _, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('old@user', 'x')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO exercises (name) VALUES ('Bench Press')`); err != nil {
		t.Fatalf("seed exercise: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO programs (user_id, name) VALUES (1, 'Old Flat Program')`); err != nil {
		t.Fatalf("seed program: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO program_exercises (program_id, exercise_id, order_index) VALUES (1, 1, 0)`); err != nil {
		t.Fatalf("seed program exercise: %v", err)
	}
	if _, err := DB.Exec(
		`INSERT INTO program_sets (program_exercise_id, set_number, target_reps, target_weight, suggested_weight, suggested_reps, suggested_is_pr)
		 VALUES (1, 1, 5, 135, 140, 5, 1)`); err != nil {
		t.Fatalf("seed program set: %v", err)
	}
	// Logged history — pre-day workouts had no program linkage at all.
	if _, err := DB.Exec(`INSERT INTO workouts (user_id, name) VALUES (1, 'Old Workout')`); err != nil {
		t.Fatalf("seed workout: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO workout_exercises (workout_id, exercise_id) VALUES (1, 1)`); err != nil {
		t.Fatalf("seed workout exercise: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO sets (workout_exercise_id, reps, weight) VALUES (1, 5, 135)`); err != nil {
		t.Fatalf("seed set: %v", err)
	}

	alterMigrations()

	// The flat program got wrapped in exactly one workout Day that owns its exercises.
	if n := countRow(t, `SELECT COUNT(*) FROM program_days WHERE program_id = 1 AND is_rest_day = 0 AND order_index = 0`); n != 1 {
		t.Fatalf("expected exactly 1 wrapper day, got %d", n)
	}
	if n := countRow(t, `SELECT COUNT(*) FROM program_exercises WHERE program_id = 1 AND program_day_id IS NULL`); n != 0 {
		t.Fatalf("expected no orphaned program_exercises, got %d", n)
	}
	// The staged (#40) suggestion survived both migrations untouched.
	var sw float64
	var sr, spr int
	if err := DB.QueryRow(`SELECT suggested_weight, suggested_reps, suggested_is_pr FROM program_sets WHERE id = 1`).Scan(&sw, &sr, &spr); err != nil {
		t.Fatalf("read staged suggestion: %v", err)
	}
	if sw != 140 || sr != 5 || spr != 1 {
		t.Fatalf("staged suggestion mutated by migrations: got weight=%v reps=%d is_pr=%d", sw, sr, spr)
	}
	// Workout history intact; the pre-day workout has no program linkage, so the
	// program_day_id backfill must NOT invent one (it only touches program_id rows).
	if n := countRow(t, `SELECT COUNT(*) FROM workouts`); n != 1 {
		t.Fatalf("workout history lost: %d rows", n)
	}
	if n := countRow(t, `SELECT COUNT(*) FROM workouts WHERE program_day_id IS NOT NULL`); n != 0 {
		t.Fatalf("backfill wrongly linked a non-program workout")
	}
	if n := countRow(t, `SELECT COUNT(*) FROM sets WHERE reps = 5 AND weight = 135`); n != 1 {
		t.Fatalf("logged sets lost")
	}
	// Invariant (#40 / day-delete safety): logged sets never persist a program_set_id
	// FK back to the routine — the column must not exist after any migration.
	if has, err := hasColumn("sets", "program_set_id"); err != nil {
		t.Fatalf("check sets.program_set_id: %v", err)
	} else if has {
		t.Fatalf("sets grew a program_set_id column — logged history must never hold a live FK into program_sets")
	}
	// Re-running the whole sequence is idempotent (every boot runs it).
	alterMigrations()
	if n := countRow(t, `SELECT COUNT(*) FROM program_days WHERE program_id = 1`); n != 1 {
		t.Fatalf("second boot duplicated wrapper days: %d", n)
	}
}

// TestNormalizeWorkoutStartedAt_RewritesPreFixOffsetRows seeds started_at text in
// every shape a pre-UTC-normalization deployment could have written — a no-name
// fixed-offset zone ('+0800 +0800', the driver's String() of a JSON '+08:00'
// timestamp, unreadable as time.Time), a named-zone offset ('-0500 EST'), a UTC row,
// and a CURRENT_TIMESTAMP-shaped row — and asserts the backfill rewrites only the
// non-UTC rows to UTC so stored-text ordering matches instant ordering.
func TestNormalizeWorkoutStartedAt_RewritesPreFixOffsetRows(t *testing.T) {
	setupMigrationTestDB(t)
	if _, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('tz@user', 'x')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	insert := func(name, startedAt string) int64 {
		t.Helper()
		res, err := DB.Exec(`INSERT INTO workouts (user_id, name, started_at) VALUES (1, ?, ?)`, name, startedAt)
		if err != nil {
			t.Fatalf("seed workout %s: %v", name, err)
		}
		id, _ := res.LastInsertId()
		return id
	}
	storedText := func(id int64) string {
		t.Helper()
		var s string
		if err := DB.QueryRow(`SELECT CAST(started_at AS TEXT) FROM workouts WHERE id = ?`, id).Scan(&s); err != nil {
			t.Fatalf("read started_at of %d: %v", id, err)
		}
		return s
	}

	// Wall-clock 02:00 the "next day" but instant 2026-07-18 18:00Z — raw text
	// ordering would wrongly rank it newest.
	fixedOffset := insert("fixed-offset", "2026-07-19 02:00:00 +0800 +0800")
	utc := insert("utc", "2026-07-18 20:00:00 +0000 UTC")
	// Instant 2026-07-19 02:00Z — the true most recent.
	namedZone := insert("named-zone", "2026-07-18 21:00:00 -0500 EST")
	plain := insert("plain", "2026-07-10 08:00:00")

	normalizeWorkoutStartedAt()

	if got := storedText(fixedOffset); got != "2026-07-18 18:00:00 +0000 UTC" {
		t.Fatalf("fixed-offset row not normalized: %q", got)
	}
	if got := storedText(namedZone); got != "2026-07-19 02:00:00 +0000 UTC" {
		t.Fatalf("named-zone row not normalized: %q", got)
	}
	if got := storedText(utc); got != "2026-07-18 20:00:00 +0000 UTC" {
		t.Fatalf("UTC row must be untouched: %q", got)
	}
	if got := storedText(plain); got != "2026-07-10 08:00:00" {
		t.Fatalf("zoneless row must be untouched: %q", got)
	}
	// Text ordering is now chronological: the named-zone row is the true most recent.
	var newest int64
	if err := DB.QueryRow(`SELECT id FROM workouts ORDER BY started_at DESC, id DESC LIMIT 1`).Scan(&newest); err != nil {
		t.Fatalf("order query: %v", err)
	}
	if newest != namedZone {
		t.Fatalf("expected the -0500 row (id %d) to text-order newest after normalization, got id %d", namedZone, newest)
	}
	// Idempotent: a second boot finds nothing to rewrite.
	normalizeWorkoutStartedAt()
	if got := storedText(fixedOffset); got != "2026-07-18 18:00:00 +0000 UTC" {
		t.Fatalf("second run changed an already-normalized row: %q", got)
	}
}

func TestNormalizeFoodLoggedAt_RewritesPreFixOffsetRows(t *testing.T) {
	setupMigrationTestDB(t)
	if _, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('tz@food', 'x')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	insert := func(name, loggedAt string) int64 {
		t.Helper()
		res, err := DB.Exec(`INSERT INTO food_logs (user_id, name, logged_at) VALUES (1, ?, ?)`, name, loggedAt)
		if err != nil {
			t.Fatalf("seed food log %s: %v", name, err)
		}
		id, _ := res.LastInsertId()
		return id
	}
	storedText := func(id int64) string {
		t.Helper()
		var s string
		if err := DB.QueryRow(`SELECT CAST(logged_at AS TEXT) FROM food_logs WHERE id = ?`, id).Scan(&s); err != nil {
			t.Fatalf("read logged_at of %d: %v", id, err)
		}
		return s
	}

	fixedOffset := insert("fixed-offset", "2026-07-19 02:00:00 +0800 +0800")
	utc := insert("utc", "2026-07-18 20:00:00 +0000 UTC")
	namedZone := insert("named-zone", "2026-07-18 21:00:00 -0500 EST")
	plain := insert("plain", "2026-07-10 08:00:00")

	normalizeFoodLoggedAt()

	if got := storedText(fixedOffset); got != "2026-07-18 18:00:00 +0000 UTC" {
		t.Fatalf("fixed-offset row not normalized: %q", got)
	}
	if got := storedText(namedZone); got != "2026-07-19 02:00:00 +0000 UTC" {
		t.Fatalf("named-zone row not normalized: %q", got)
	}
	if got := storedText(utc); got != "2026-07-18 20:00:00 +0000 UTC" {
		t.Fatalf("UTC row must be untouched: %q", got)
	}
	if got := storedText(plain); got != "2026-07-10 08:00:00" {
		t.Fatalf("zoneless row must be untouched: %q", got)
	}
	var inRange int
	if err := DB.QueryRow(
		`SELECT COUNT(*) FROM food_logs WHERE logged_at >= ? AND logged_at < ?`,
		"2026-07-18 00:00:00 +0000 UTC", "2026-07-19 00:00:00 +0000 UTC",
	).Scan(&inRange); err != nil {
		t.Fatalf("range query: %v", err)
	}
	if inRange != 2 {
		t.Fatalf("expected 2 rows in the July 18 UTC window after normalization, got %d", inRange)
	}

	normalizeFoodLoggedAt()
	if got := storedText(fixedOffset); got != "2026-07-18 18:00:00 +0000 UTC" {
		t.Fatalf("second run changed an already-normalized row: %q", got)
	}

	done, err := hasMigrationFlag("normalize_food_logged_at")
	if err != nil {
		t.Fatalf("check flag: %v", err)
	}
	if !done {
		t.Fatalf("expected normalize_food_logged_at flag set once a run finds nothing to rewrite")
	}
	if wDone, err := hasMigrationFlag("normalize_workout_started_at"); err != nil || wDone {
		t.Fatalf("food normalization must not touch the workouts flag (done=%v, err=%v)", wDone, err)
	}
}

// TestProgramDayBackfillTransitionalWindow simulates the deployment window that ran
// the multi-day release (program_days + workouts.program_id exist) but predates the
// program_day_id fix: its program workouts carry program_id and no day linkage. The
// backfill must attribute those rows to the program's FIRST workout day (lowest
// order_index, non-rest — not merely order_index 0, which can be a rest slot) — and
// must never re-run once the column exists, because a NULL can then also mean "its
// day was deleted" (ON DELETE SET NULL), which a re-run would wrongly overwrite.
func TestProgramDayBackfillTransitionalWindow(t *testing.T) {
	setupMigrationTestDB(t)

	if _, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('old@user', 'x')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO programs (user_id, name) VALUES (1, 'Cycle')`); err != nil {
		t.Fatalf("seed program: %v", err)
	}

	// Bring the DB to the multi-day release's shape, then rebuild the cycle so its
	// FIRST slot is a rest day.
	multiDayProgramsMigration()
	ensureColumn("workouts", "program_id", `ALTER TABLE workouts ADD COLUMN program_id INTEGER`)
	if _, err := DB.Exec(`DELETE FROM program_days WHERE program_id = 1`); err != nil {
		t.Fatalf("clear wrapper day: %v", err)
	}
	var dayIDs [3]int64
	for i, rest := range []int{1, 0, 0} { // 0=Rest 1=A 2=B
		res, err := DB.Exec(`INSERT INTO program_days (program_id, order_index, is_rest_day, name) VALUES (1, ?, ?, '')`, i, rest)
		if err != nil {
			t.Fatalf("seed day %d: %v", i, err)
		}
		dayIDs[i], _ = res.LastInsertId()
	}
	// Two transitional-window workouts: attributed to the program, day unknown.
	for i := 0; i < 2; i++ {
		if _, err := DB.Exec(`INSERT INTO workouts (user_id, name, program_id) VALUES (1, 'w', 1)`); err != nil {
			t.Fatalf("seed transitional workout: %v", err)
		}
	}

	workoutProgramDayMigration()

	if n := countRow(t, `SELECT COUNT(*) FROM workouts WHERE program_id = 1 AND program_day_id = ?`, dayIDs[1]); n != 2 {
		t.Fatalf("expected both transitional workouts backfilled to the first WORKOUT day (A), got %d", n)
	}

	// Delete day A → SET NULL on its workouts; a re-run must NOT re-backfill them.
	if _, err := DB.Exec(`DELETE FROM program_days WHERE id = ?`, dayIDs[1]); err != nil {
		t.Fatalf("delete day A: %v", err)
	}
	if n := countRow(t, `SELECT COUNT(*) FROM workouts WHERE program_day_id IS NULL`); n != 2 {
		t.Fatalf("ON DELETE SET NULL didn't drop the linkage: %d null rows", n)
	}
	workoutProgramDayMigration()
	if n := countRow(t, `SELECT COUNT(*) FROM workouts WHERE program_day_id IS NULL`); n != 2 {
		t.Fatalf("backfill re-ran on an already-migrated DB and overwrote SET NULL rows")
	}
}

// An existing server upgrading to stored days must not move anything a user can see.
//
// This is the one property no fresh-database test can check: the app worked before by
// deriving each day from the account's zone at read time, and works after by reading a
// day off the row. The upgrade is only safe if the backfill reproduces the old answer
// exactly — so the assertion is against the *old* rule, computed independently here.
func TestBackfillLocalDays_reproducesThePreMigrationDay(t *testing.T) {
	setupMigrationTestDB(t)

	if _, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('old@user', 'x')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	// A user already living west of UTC, the case the whole feature exists for.
	if _, err := DB.Exec(`INSERT INTO user_settings (user_id, timezone) VALUES (1, 'America/New_York')`); err != nil {
		t.Fatalf("seed settings: %v", err)
	}

	// Instants chosen to straddle both midnights: 03:00Z is the previous day in New
	// York, 16:00Z is the same day, and 23:30Z is still the same day there.
	instants := []time.Time{
		time.Date(2026, 8, 5, 3, 0, 0, 0, time.UTC),
		time.Date(2026, 8, 5, 16, 0, 0, 0, time.UTC),
		time.Date(2026, 8, 5, 23, 30, 0, 0, time.UTC),
	}
	for i, at := range instants {
		if _, err := DB.Exec(
			`INSERT INTO food_logs (user_id, name, meal, calories, protein, carbs, fat, servings, logged_at)
			 VALUES (1, ?, 'dinner', 100, 0, 0, 0, 1, ?)`, fmt.Sprintf("meal-%d", i), at); err != nil {
			t.Fatalf("seed food %d: %v", i, err)
		}
		if _, err := DB.Exec(`INSERT INTO weight_logs (user_id, weight, logged_at) VALUES (1, 180, ?)`, at); err != nil {
			t.Fatalf("seed weight %d: %v", i, err)
		}
		if _, err := DB.Exec(`INSERT INTO workouts (user_id, name, started_at) VALUES (1, ?, ?)`,
			fmt.Sprintf("lift-%d", i), at); err != nil {
			t.Fatalf("seed workout %d: %v", i, err)
		}
	}

	alterMigrations()

	// The pre-migration rule, spelled out rather than reused, so a bug in the
	// migration's helper cannot also define what "correct" means here.
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatalf("load zone: %v", err)
	}
	for i, at := range instants {
		want := at.In(ny).Format("2006-01-02")

		var foodDay, weightDay string
		if err := DB.QueryRow(`SELECT logged_on FROM food_logs WHERE name = ?`, fmt.Sprintf("meal-%d", i)).Scan(&foodDay); err != nil {
			t.Fatalf("read food day %d: %v", i, err)
		}
		if foodDay != want {
			t.Errorf("food %d (%s): backfilled %q, pre-migration read gave %q", i, at.Format(time.RFC3339), foodDay, want)
		}
		if err := DB.QueryRow(`SELECT logged_on FROM weight_logs WHERE logged_at = ?`, at).Scan(&weightDay); err != nil {
			t.Fatalf("read weight day %d: %v", i, err)
		}
		if weightDay != want {
			t.Errorf("weight %d: backfilled %q, want %q", i, weightDay, want)
		}

		// The workout stores an offset instead of a day; applying it must name the
		// same day. -240 in August (EDT), -300 in winter.
		var offset int
		if err := DB.QueryRow(`SELECT tz_offset_minutes FROM workouts WHERE name = ?`, fmt.Sprintf("lift-%d", i)).Scan(&offset); err != nil {
			t.Fatalf("read workout offset %d: %v", i, err)
		}
		if got := at.Add(time.Duration(offset) * time.Minute).Format("2006-01-02"); got != want {
			t.Errorf("workout %d: offset %d puts it on %q, want %q", i, offset, got, want)
		}
	}
}

// The backfill must not run twice, and must leave already-filled rows alone — a
// second boot re-deriving days would undo any day a client had since corrected.
func TestBackfillLocalDays_isIdempotent(t *testing.T) {
	setupMigrationTestDB(t)
	if _, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('old@user', 'x')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := DB.Exec(
		`INSERT INTO food_logs (user_id, name, meal, calories, protein, carbs, fat, servings, logged_at)
		 VALUES (1, 'meal', 'dinner', 100, 0, 0, 0, 1, ?)`,
		time.Date(2026, 8, 5, 16, 0, 0, 0, time.UTC)); err != nil {
		t.Fatalf("seed food: %v", err)
	}
	alterMigrations()

	// Stand in for a client that has since filed this entry under a different day.
	if _, err := DB.Exec(`UPDATE food_logs SET logged_on = '1999-01-01' WHERE name = 'meal'`); err != nil {
		t.Fatalf("overwrite day: %v", err)
	}
	alterMigrations()

	var day string
	if err := DB.QueryRow(`SELECT logged_on FROM food_logs WHERE name = 'meal'`).Scan(&day); err != nil {
		t.Fatalf("read day: %v", err)
	}
	if day != "1999-01-01" {
		t.Errorf("second migration pass rewrote a filled day to %q", day)
	}
}

// One unreadable legacy timestamp must not take the rest of the upgrade with it.
//
// backfillDayColumn used to scan straight into time.Time, so a value the driver cannot
// parse failed the scan, returned an error, and made backfillLocalDays bail — before
// the workout-offset backfill and before the completion flag. Every later boot retried
// and failed identically, leaving logged_on unset and tz_offset_minutes null forever.
// A row that cannot be read is now skipped and reported; everything else still lands.
func TestBackfillLocalDays_oneUnreadableRowDoesNotBlockTheRest(t *testing.T) {
	setupMigrationTestDB(t)

	if _, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('old@user', 'x')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO user_settings (user_id, timezone) VALUES (1, 'America/New_York')`); err != nil {
		t.Fatalf("seed settings: %v", err)
	}

	good := time.Date(2026, 8, 5, 16, 0, 0, 0, time.UTC)
	// Written as raw text the driver cannot turn back into a time.Time — the shape
	// normalizeUTCTimestamps exists to repair, which is why it now covers weight_logs.
	if _, err := DB.Exec(`INSERT INTO weight_logs (user_id, weight, logged_at) VALUES (1, 180, 'not-a-timestamp')`); err != nil {
		t.Fatalf("seed unreadable weight: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO weight_logs (user_id, weight, logged_at) VALUES (1, 181, ?)`, good); err != nil {
		t.Fatalf("seed good weight: %v", err)
	}
	if _, err := DB.Exec(`INSERT INTO workouts (user_id, name, started_at) VALUES (1, 'lift', ?)`, good); err != nil {
		t.Fatalf("seed workout: %v", err)
	}
	// The offset backfill reads started_at the same way, and had the same defect. Seeding
	// an unreadable weight row alone let that one survive a review: the run died in the
	// weight pass, so the workout pass never got to fail on its own account.
	if _, err := DB.Exec(`INSERT INTO workouts (user_id, name, started_at) VALUES (1, 'bad lift', 'not-a-timestamp')`); err != nil {
		t.Fatalf("seed unreadable workout: %v", err)
	}

	alterMigrations()

	var day string
	if err := DB.QueryRow(`SELECT logged_on FROM weight_logs WHERE weight = 181`).Scan(&day); err != nil {
		t.Fatalf("read good weight day: %v", err)
	}
	if want := "2026-08-05"; day != want {
		t.Errorf("readable row was not backfilled: got %q, want %q", day, want)
	}

	// The offset backfill runs after the day backfill, so it is the first casualty of
	// an early return and the clearest signal the run completed.
	var offset sql.NullInt64
	if err := DB.QueryRow(`SELECT tz_offset_minutes FROM workouts WHERE name = 'lift'`).Scan(&offset); err != nil {
		t.Fatalf("read workout offset: %v", err)
	}
	if !offset.Valid {
		t.Error("workout offset never backfilled — the run stopped at the unreadable row")
	}

	done, err := hasMigrationFlag("backfill_local_days")
	if err != nil {
		t.Fatalf("check flag: %v", err)
	}
	if !done {
		t.Error("completion flag never set — every boot will retry this forever")
	}
}

// An existing install carries the taxonomy exactly as free-exercise-db spelled it
// ("body only", "lower back"). open-exercise-db serves the same vocabulary as
// slugs. Left unconverted the table holds both spellings of one concept, and
// every equipment or muscle filter silently returns half its rows.
func TestNormalizeExerciseTaxonomy_RewritesLegacySpellings(t *testing.T) {
	setupMigrationTestDB(t)

	rows := []struct{ name, muscle, category, equipment, secondary string }{
		{"Push Up", "chest", "strength", "body only", `["triceps","lower back"]`},
		{"Deadlift", "lower back", "strength", "barbell", `["middle back","glutes"]`},
		{"Snatch", "shoulders", "olympic weightlifting", "", `[]`},
		{"Curl", "biceps", "strength", "e-z curl bar", `[]`},
		{"Ball Crunch", "abdominals", "strength", "exercise ball", `[]`},
		{"Roll Out", "abdominals", "strength", "foam roll", `[]`},
		{"Med Ball Throw", "chest", "plyometrics", "medicine ball", `[]`},
	}
	for _, r := range rows {
		if _, err := DB.Exec(`INSERT INTO exercises (name, muscle_group, category, equipment, secondary_muscles)
			VALUES (?, ?, ?, ?, ?)`, r.name, r.muscle, r.category, r.equipment, r.secondary); err != nil {
			t.Fatalf("seed %s: %v", r.name, err)
		}
	}

	alterMigrations()

	want := map[string][3]string{ // name -> {muscle_group, category, equipment}
		"Push Up":        {"chest", "strength", "body-only"},
		"Deadlift":       {"lower-back", "strength", "barbell"},
		"Snatch":         {"shoulders", "olympic-weightlifting", "none"},
		"Curl":           {"biceps", "strength", "e-z-curl-bar"},
		"Ball Crunch":    {"abdominals", "strength", "exercise-ball"},
		"Roll Out":       {"abdominals", "strength", "foam-roll"},
		"Med Ball Throw": {"chest", "plyometrics", "medicine-ball"},
	}
	for name, w := range want {
		var muscle, category, equipment string
		if err := DB.QueryRow(`SELECT muscle_group, category, equipment FROM exercises WHERE name = ?`, name).
			Scan(&muscle, &category, &equipment); err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if muscle != w[0] || category != w[1] || equipment != w[2] {
			t.Errorf("%s = %q/%q/%q, want %q/%q/%q", name, muscle, category, equipment, w[0], w[1], w[2])
		}
	}

	var secondary string
	DB.QueryRow(`SELECT secondary_muscles FROM exercises WHERE name = 'Deadlift'`).Scan(&secondary)
	if secondary != `["middle-back","glutes"]` {
		t.Errorf("secondary_muscles = %s, want the slug form", secondary)
	}
}

// The rewrite runs once and is not re-applied. It is guarded by a migration flag
// rather than being idempotent by construction, because a second pass over a
// table that has since gained user-contributed values could rewrite something it
// should not.
func TestNormalizeExerciseTaxonomy_RunsOnce(t *testing.T) {
	setupMigrationTestDB(t)
	if _, err := DB.Exec(`INSERT INTO exercises (name, equipment) VALUES ('Push Up', 'body only')`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	alterMigrations()
	if _, err := DB.Exec(`UPDATE exercises SET equipment = 'body only' WHERE name = 'Push Up'`); err != nil {
		t.Fatalf("reintroduce: %v", err)
	}
	alterMigrations()

	var equipment string
	DB.QueryRow(`SELECT equipment FROM exercises WHERE name = 'Push Up'`).Scan(&equipment)
	if equipment != "body only" {
		t.Errorf("equipment = %q, want the migration to have skipped its second run", equipment)
	}
}

// The unique index added for #115 is created with ensureIndex, which is log.Fatal on
// failure — so on any database that already holds duplicate bookmarks, getting the
// dedupe order wrong does not produce a bad row, it stops the server booting. That is
// precisely the set of installs that have the bug, which makes this the migration worth
// pinning rather than trusting.
func TestDedupeSavedFoods_collapsesDuplicatesAndIndexes(t *testing.T) {
	setupMigrationTestDB(t)

	var uid, other int64
	for _, u := range []struct {
		email string
		into  *int64
	}{{"dupes@example.com", &uid}, {"other@example.com", &other}} {
		res, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, 'x')`, u.email)
		if err != nil {
			t.Fatalf("insert user: %v", err)
		}
		*u.into, _ = res.LastInsertId()
	}

	// The state from the issue: the same bookmark pressed twice, plus rows that only
	// look similar — a different brand, and another user's identical bookmark.
	rows := []struct {
		uid   int64
		name  string
		brand string
		kcal  float64
	}{
		{uid, "Chicken Breast", "Tesco", 165},
		{uid, "Chicken Breast", "Tesco", 170}, // duplicate, differing macros
		{uid, "Chicken Breast", "Tesco", 165}, // duplicate again
		{uid, "Chicken Breast", "Sainsbury's", 168},
		{uid, "Rolled Oats", "Quaker", 389},
		{other, "Chicken Breast", "Tesco", 165},
	}
	for _, r := range rows {
		if _, err := DB.Exec(
			`INSERT INTO saved_foods (user_id, name, brand, calories) VALUES (?, ?, ?, ?)`,
			r.uid, r.name, r.brand, r.kcal,
		); err != nil {
			t.Fatalf("seed saved_food: %v", err)
		}
	}

	alterMigrations()

	var n int
	if err := DB.QueryRow(
		`SELECT COUNT(*) FROM saved_foods WHERE user_id = ? AND name = 'Chicken Breast' AND brand = 'Tesco'`, uid,
	).Scan(&n); err != nil {
		t.Fatalf("count duplicates: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected the duplicates collapsed to 1 row, got %d", n)
	}

	// Earliest row wins, so the surviving macros are the first save's.
	var kcal float64
	DB.QueryRow(
		`SELECT calories FROM saved_foods WHERE user_id = ? AND name = 'Chicken Breast' AND brand = 'Tesco'`, uid,
	).Scan(&kcal)
	if kcal != 165 {
		t.Errorf("kept calories %v, want the first save's 165", kcal)
	}

	// The look-alikes are untouched: a different brand is a different product, and
	// uniqueness is per user.
	if err := DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE user_id = ?`, uid).Scan(&n); err != nil {
		t.Fatalf("count user rows: %v", err)
	}
	if n != 3 {
		t.Errorf("expected 3 rows left for the user (Tesco, Sainsbury's, Oats), got %d", n)
	}
	if err := DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE user_id = ?`, other).Scan(&n); err != nil {
		t.Fatalf("count other user rows: %v", err)
	}
	if n != 1 {
		t.Errorf("other user's bookmark was collapsed too: %d rows", n)
	}

	// And the index now actually forbids what the migration just cleaned up.
	if _, err := DB.Exec(
		`INSERT INTO saved_foods (user_id, name, brand, calories) VALUES (?, 'Rolled Oats', 'Quaker', 389)`, uid,
	); err == nil {
		t.Fatal("a duplicate bookmark was still insertable after the migration")
	}
}

// alterMigrations runs on every boot; the dedupe must not fight the index on the second
// pass, and must not touch rows that are legitimately there.
func TestDedupeSavedFoods_isIdempotentAcrossBoots(t *testing.T) {
	setupMigrationTestDB(t)

	res, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('boot@example.com', 'x')`)
	if err != nil {
		t.Fatalf("insert user: %v", err)
	}
	uid, _ := res.LastInsertId()
	if _, err := DB.Exec(
		`INSERT INTO saved_foods (user_id, name, brand, calories) VALUES (?, 'Oats', 'Quaker', 389)`, uid,
	); err != nil {
		t.Fatalf("seed: %v", err)
	}

	alterMigrations()
	alterMigrations()

	var n int
	DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE user_id = ?`, uid).Scan(&n)
	if n != 1 {
		t.Fatalf("expected the single bookmark to survive two boots, got %d rows", n)
	}
}

// The trim migration has to normalise rows written before the handlers trimmed, without
// tripping the unique index #136 added. Order is the risk: trimming before deduping
// fails the moment two rows trim to the same key, so this pins the whole sequence.
func TestTrimSavedFoods_normalisesAndCollapses(t *testing.T) {
	setupMigrationTestDB(t)

	var uid, other int64
	for _, u := range []struct {
		email string
		into  *int64
	}{{"trim@example.com", &uid}, {"other@example.com", &other}} {
		res, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, 'x')`, u.email)
		if err != nil {
			t.Fatalf("insert user: %v", err)
		}
		*u.into, _ = res.LastInsertId()
	}

	rows := []struct {
		uid   int64
		name  string
		brand string
		kcal  float64
	}{
		{uid, "Oats", "Quaker", 100},     // id 1 — earliest, should survive
		{uid, "Oats ", "Quaker", 110},    // trailing space
		{uid, " Oats", " Quaker ", 120},  // leading, and a padded brand
		{uid, "\tOats\n", "Quaker", 130}, // tab/newline — plain TRIM() would miss these
		{uid, "   ", "", 140},            // whitespace-only name: a blank row
		{uid, "Oats", "Lidl", 150},       // different brand, genuinely another product
		{other, "Oats ", "Quaker", 160},  // another user's row
	}
	for _, r := range rows {
		if _, err := DB.Exec(
			`INSERT INTO saved_foods (user_id, name, brand, calories) VALUES (?, ?, ?, ?)`,
			r.uid, r.name, r.brand, r.kcal,
		); err != nil {
			t.Fatalf("seed saved_food: %v", err)
		}
	}
	// No brand column yet — alterMigrations adds it. That is exactly the pre-migration
	// shape this test exists to upgrade, so the fixture must not invent it.
	if _, err := DB.Exec(
		`INSERT INTO food_logs (user_id, name, meal, calories, logged_at)
		 VALUES (?, ' Oats ', 'breakfast', 100, '2026-01-01 08:00:00')`, uid,
	); err != nil {
		t.Fatalf("seed food_log: %v", err)
	}

	alterMigrations()

	var name, brand string
	var kcal float64
	if err := DB.QueryRow(
		`SELECT name, brand, calories FROM saved_foods WHERE user_id = ? AND brand = 'Quaker'`, uid,
	).Scan(&name, &brand, &kcal); err != nil {
		t.Fatalf("expected exactly one Quaker row: %v", err)
	}
	if name != "Oats" || brand != "Quaker" {
		t.Errorf("survivor is %q/%q, want \"Oats\"/\"Quaker\"", name, brand)
	}
	if kcal != 100 {
		t.Errorf("kept calories %v, want the earliest row's 100", kcal)
	}

	var n int
	DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE user_id = ?`, uid).Scan(&n)
	if n != 2 {
		t.Errorf("expected 2 rows for the user (Quaker + Lidl), got %d", n)
	}
	DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE TRIM(name) = ''`).Scan(&n)
	if n != 0 {
		t.Errorf("%d blank-name row(s) survived", n)
	}
	DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE user_id = ?`, other).Scan(&n)
	if n != 1 {
		t.Errorf("the other user's row was touched: %d rows", n)
	}

	// The log feeds Recent, which matches favourites by name+brand.
	if err := DB.QueryRow(`SELECT name, brand FROM food_logs WHERE user_id = ?`, uid).Scan(&name, &brand); err != nil {
		t.Fatalf("read food_log: %v", err)
	}
	if name != "Oats" {
		t.Errorf("food_log name is %q, want trimmed", name)
	}
	if brand != "" {
		t.Errorf("a pre-migration log should default to an empty brand, got %q", brand)
	}

	// And the index is in place afterwards, which is what the ordering protects.
	if _, err := DB.Exec(
		`INSERT INTO saved_foods (user_id, name, brand, calories) VALUES (?, 'Oats', 'Quaker', 1)`, uid,
	); err == nil {
		t.Error("a duplicate was insertable after the migration")
	}
}

// alterMigrations runs on every boot; the trim must not re-run or fight the index.
func TestTrimSavedFoods_isIdempotentAcrossBoots(t *testing.T) {
	setupMigrationTestDB(t)

	res, err := DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('boot2@example.com', 'x')`)
	if err != nil {
		t.Fatalf("insert user: %v", err)
	}
	uid, _ := res.LastInsertId()
	if _, err := DB.Exec(
		`INSERT INTO saved_foods (user_id, name, brand, calories) VALUES (?, 'Oats ', 'Quaker', 100)`, uid,
	); err != nil {
		t.Fatalf("seed: %v", err)
	}

	alterMigrations()
	alterMigrations()

	var name string
	var n int
	DB.QueryRow(`SELECT COUNT(*) FROM saved_foods WHERE user_id = ?`, uid).Scan(&n)
	DB.QueryRow(`SELECT name FROM saved_foods WHERE user_id = ?`, uid).Scan(&name)
	if n != 1 || name != "Oats" {
		t.Fatalf("after two boots: %d row(s), name %q", n, name)
	}
}

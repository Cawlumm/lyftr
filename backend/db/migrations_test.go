package db

import (
	"database/sql"
	"fmt"
	"math/rand"
	"testing"

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

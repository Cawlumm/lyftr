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
// between the two, same as a real upgrade of an existing database).
func setupMigrationTestDB(t *testing.T) {
	t.Helper()
	name := fmt.Sprintf("file:migtestdb_%d?mode=memory&cache=shared", rand.Int63())
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

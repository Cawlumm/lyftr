package db

import (
	"database/sql"
	"fmt"
	"math/rand"
	"testing"

	_ "modernc.org/sqlite"
)

// openSchemaDB spins up a fresh in-memory SQLite with the full schema applied and
// foreign keys on, matching the production DSN pragma.
func openSchemaDB(t *testing.T) *sql.DB {
	t.Helper()
	name := fmt.Sprintf("file:migtest_%d?mode=memory&cache=shared&_pragma=foreign_keys(on)", rand.Int63())
	d, err := sql.Open("sqlite", name)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := d.Exec(schema); err != nil {
		t.Fatalf("apply schema: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

func TestBackfillProgramDays_WrapsDaylessExercisesIntoDayOne(t *testing.T) {
	d := openSchemaDB(t)
	// A legacy program: exercises inserted with a NULL program_day_id.
	if _, err := d.Exec(`INSERT INTO users (email, password_hash) VALUES ('u@x', 'h')`); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO exercises (name) VALUES ('Bench')`); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO programs (user_id, name) VALUES (1, 'Legacy')`); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO program_exercises (program_id, exercise_id, order_index) VALUES (1, 1, 0)`); err != nil {
		t.Fatal(err)
	}

	if err := backfillProgramDays(d); err != nil {
		t.Fatalf("backfill: %v", err)
	}

	var dayCount, dayIsRest int
	var dayName string
	if err := d.QueryRow(`SELECT COUNT(*) FROM program_days WHERE program_id = 1`).Scan(&dayCount); err != nil {
		t.Fatal(err)
	}
	if dayCount != 1 {
		t.Fatalf("want 1 day, got %d", dayCount)
	}
	if err := d.QueryRow(`SELECT name, is_rest_day FROM program_days WHERE program_id = 1`).Scan(&dayName, &dayIsRest); err != nil {
		t.Fatal(err)
	}
	if dayName != "Day 1" || dayIsRest != 0 {
		t.Fatalf("want training day 'Day 1', got name=%q is_rest=%d", dayName, dayIsRest)
	}

	// The exercise now belongs to that day.
	var orphaned int
	if err := d.QueryRow(`SELECT COUNT(*) FROM program_exercises WHERE program_day_id IS NULL`).Scan(&orphaned); err != nil {
		t.Fatal(err)
	}
	if orphaned != 0 {
		t.Fatalf("want 0 dayless exercises, got %d", orphaned)
	}
}

func TestBackfillProgramDays_SecondRunIsNoOp(t *testing.T) {
	d := openSchemaDB(t)
	if _, err := d.Exec(`INSERT INTO users (email, password_hash) VALUES ('u@x', 'h')`); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO exercises (name) VALUES ('Bench')`); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO programs (user_id, name) VALUES (1, 'Legacy')`); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO program_exercises (program_id, exercise_id, order_index) VALUES (1, 1, 0)`); err != nil {
		t.Fatal(err)
	}

	if err := backfillProgramDays(d); err != nil {
		t.Fatalf("first backfill: %v", err)
	}
	if err := backfillProgramDays(d); err != nil {
		t.Fatalf("second backfill: %v", err)
	}

	// Still exactly one day, no duplicate.
	var dayCount int
	if err := d.QueryRow(`SELECT COUNT(*) FROM program_days WHERE program_id = 1`).Scan(&dayCount); err != nil {
		t.Fatal(err)
	}
	if dayCount != 1 {
		t.Fatalf("second run should not add a day: want 1, got %d", dayCount)
	}
}

// A fresh DB with no dayless exercises must be a clean no-op (the boot path on an
// already-migrated database).
func TestBackfillProgramDays_EmptyDBNoOp(t *testing.T) {
	d := openSchemaDB(t)
	if err := backfillProgramDays(d); err != nil {
		t.Fatalf("backfill on empty db: %v", err)
	}
	var dayCount int
	if err := d.QueryRow(`SELECT COUNT(*) FROM program_days`).Scan(&dayCount); err != nil {
		t.Fatal(err)
	}
	if dayCount != 0 {
		t.Fatalf("want 0 days, got %d", dayCount)
	}
}

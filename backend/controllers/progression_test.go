package controllers

import (
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
)

// ptTarget is a seeded routine set target (issue #40 auto-progression tests).
type ptTarget struct {
	Reps   int
	Weight float64
}

func seedProgram(t *testing.T, uid, exID int64, targets []ptTarget) (int64, []int64) {
	t.Helper()
	res, err := db.DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, 'Push A')`, uid)
	if err != nil {
		t.Fatalf("seed program: %v", err)
	}
	pid, _ := res.LastInsertId()
	peRes, err := db.DB.Exec(`INSERT INTO program_exercises (program_id, exercise_id, order_index) VALUES (?, ?, 0)`, pid, exID)
	if err != nil {
		t.Fatalf("seed program exercise: %v", err)
	}
	peid, _ := peRes.LastInsertId()
	ids := make([]int64, 0, len(targets))
	for i, tg := range targets {
		sr, err := db.DB.Exec(
			`INSERT INTO program_sets (program_exercise_id, set_number, target_reps, target_weight) VALUES (?, ?, ?, ?)`,
			peid, i+1, tg.Reps, tg.Weight,
		)
		if err != nil {
			t.Fatalf("seed program set: %v", err)
		}
		sid, _ := sr.LastInsertId()
		ids = append(ids, sid)
	}
	return pid, ids
}

func getTarget(t *testing.T, setID int64) (int, float64) {
	t.Helper()
	var r int
	var w float64
	if err := db.DB.QueryRow(`SELECT target_reps, target_weight FROM program_sets WHERE id = ?`, setID).Scan(&r, &w); err != nil {
		t.Fatalf("read target %d: %v", setID, err)
	}
	return r, w
}

func insertUser(t *testing.T, email string) int64 {
	t.Helper()
	res, err := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES (?, 'h')`, email)
	if err != nil {
		t.Fatalf("insert user %s: %v", email, err)
	}
	id, _ := res.LastInsertId()
	return id
}

// Heavier weight raises weight (adopting the reps done at it); same weight with
// more reps raises reps; an equalled target is untouched. Count reflects only
// real updates.
func TestProgressTargets_UpwardRule(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	uid := createTestUser(t)
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, uid, exID, []ptTarget{{5, 100}, {5, 100}, {5, 100}})

	name, count, err := ps.ProgressTargets(uid, pid, []stores.ProgressInput{
		{ProgramSetID: ids[0], Weight: 105, Reps: 5}, // heavier → weight+reps
		{ProgramSetID: ids[1], Weight: 100, Reps: 6}, // same weight, more reps → reps
		{ProgramSetID: ids[2], Weight: 100, Reps: 5}, // equalled → unchanged
	})
	if err != nil {
		t.Fatalf("ProgressTargets: %v", err)
	}
	if name != "Push A" {
		t.Errorf("name = %q, want Push A", name)
	}
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}
	if r, w := getTarget(t, ids[0]); r != 5 || w != 105 {
		t.Errorf("set0 = %d×%.1f, want 5×105", r, w)
	}
	if r, w := getTarget(t, ids[1]); r != 6 || w != 100 {
		t.Errorf("set1 = %d×%.1f, want 6×100", r, w)
	}
	if r, w := getTarget(t, ids[2]); r != 5 || w != 100 {
		t.Errorf("set2 = %d×%.1f, want 5×100 (unchanged)", r, w)
	}
}

// A lighter weight never lowers the target, even with more reps (the rule is
// weight-first) — a deload must not rewrite the routine.
func TestProgressTargets_NeverLowers(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	uid := createTestUser(t)
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, uid, exID, []ptTarget{{8, 100}})

	_, count, err := ps.ProgressTargets(uid, pid, []stores.ProgressInput{
		{ProgramSetID: ids[0], Weight: 95, Reps: 12},
	})
	if err != nil {
		t.Fatalf("ProgressTargets: %v", err)
	}
	if count != 0 {
		t.Errorf("count = %d, want 0 (lighter never progresses)", count)
	}
	if r, w := getTarget(t, ids[0]); r != 8 || w != 100 {
		t.Errorf("target = %d×%.1f, want 8×100 (unchanged)", r, w)
	}
}

// Ownership + program-join guard (IDOR): a user cannot bump another user's routine
// targets — neither by passing the victim's program id (ownership gate) nor by
// passing the victim's set id under their own program id (the pe.program_id join).
func TestProgressTargets_OwnershipGuard(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	owner := createTestUser(t)
	attacker := insertUser(t, "attacker@example.com")
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, owner, exID, []ptTarget{{5, 100}})

	// (a) attacker passes the owner's program id → ownership gate → no-op.
	name, count, err := ps.ProgressTargets(attacker, pid, []stores.ProgressInput{
		{ProgramSetID: ids[0], Weight: 999, Reps: 99},
	})
	if err != nil || name != "" || count != 0 {
		t.Errorf("victim-program call = (%q, %d, %v), want (\"\", 0, nil)", name, count, err)
	}

	// (b) attacker passes the owner's set id under their OWN program id → join fails → skip.
	p2, _ := seedProgram(t, attacker, exID, []ptTarget{{5, 50}})
	_, count2, err := ps.ProgressTargets(attacker, p2, []stores.ProgressInput{
		{ProgramSetID: ids[0], Weight: 999, Reps: 99},
	})
	if err != nil || count2 != 0 {
		t.Errorf("cross-program call = (%d, %v), want (0, nil)", count2, err)
	}

	if r, w := getTarget(t, ids[0]); r != 5 || w != 100 {
		t.Fatalf("owner's target mutated to %d×%.1f — IDOR!", r, w)
	}
}

// An unknown/deleted set id is a harmless no-op, not an error.
func TestProgressTargets_UnknownSet(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	uid := createTestUser(t)
	exID := createTestExercise(t)
	pid, _ := seedProgram(t, uid, exID, []ptTarget{{5, 100}})

	_, count, err := ps.ProgressTargets(uid, pid, []stores.ProgressInput{
		{ProgramSetID: 999999, Weight: 200, Reps: 10},
	})
	if err != nil {
		t.Fatalf("ProgressTargets: %v", err)
	}
	if count != 0 {
		t.Errorf("count = %d, want 0", count)
	}
}

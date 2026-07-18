package controllers

import (
	"net/http"
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

// getSuggestion returns the staged suggestion for a set: (reps, weight, isPR, present).
// present is false when no suggestion is staged (suggested_reps IS NULL).
func getSuggestion(t *testing.T, setID int64) (int, float64, bool, bool) {
	t.Helper()
	var nr *int64
	var nw *float64
	var npr int
	if err := db.DB.QueryRow(`SELECT suggested_reps, suggested_weight, suggested_is_pr FROM program_sets WHERE id = ?`, setID).Scan(&nr, &nw, &npr); err != nil {
		t.Fatalf("read suggestion %d: %v", setID, err)
	}
	if nr == nil {
		return 0, 0, false, false
	}
	weight := 0.0
	if nw != nil {
		weight = *nw
	}
	return int(*nr), weight, npr == 1, true
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

// SuggestTargets STAGES suggestions (never mutates target_*): heavier weight suggests
// weight+reps; same weight + more reps suggests reps; equalled → nothing. The is-PR flag
// and count/anyPR are surfaced. Targets stay put until approved.
func TestSuggestTargets_StagesUpwardOnly(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	uid := createTestUser(t)
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, uid, exID, []ptTarget{{5, 100}, {5, 100}, {5, 100}})

	name, count, anyPR, err := ps.SuggestTargets(uid, pid, []stores.ProgressInput{
		{ProgramSetID: ids[0], Weight: 105, Reps: 5, IsPR: true},  // heavier → weight+reps, PR
		{ProgramSetID: ids[1], Weight: 100, Reps: 6, IsPR: false}, // more reps → reps
		{ProgramSetID: ids[2], Weight: 100, Reps: 5, IsPR: false}, // equalled → nothing
	})
	if err != nil {
		t.Fatalf("SuggestTargets: %v", err)
	}
	if name != "Push A" || count != 2 || !anyPR {
		t.Errorf("got (name=%q count=%d anyPR=%v), want (Push A, 2, true)", name, count, anyPR)
	}
	// Targets unchanged (nothing applied yet).
	for _, id := range ids {
		if r, w := getTarget(t, id); r != 5 || w != 100 {
			t.Errorf("target %d changed to %d×%.1f — should stay 5×100 until approved", id, r, w)
		}
	}
	// Suggestions staged on the two beaten sets.
	if r, w, pr, ok := getSuggestion(t, ids[0]); !ok || r != 5 || w != 105 || !pr {
		t.Errorf("set0 suggestion = (%d×%.1f pr=%v ok=%v), want 5×105 pr=true", r, w, pr, ok)
	}
	if r, _, pr, ok := getSuggestion(t, ids[1]); !ok || r != 6 || pr {
		t.Errorf("set1 suggestion = (%d reps pr=%v ok=%v), want 6 reps pr=false", r, pr, ok)
	}
	if _, _, _, ok := getSuggestion(t, ids[2]); ok {
		t.Errorf("set2 should have no suggestion (equalled target)")
	}
}

// A pending suggestion is never downgraded by a later smaller-but-over-target set;
// a bigger one overwrites it (compare against best-of target/pending).
func TestSuggestTargets_KeepsBestPending(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	uid := createTestUser(t)
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, uid, exID, []ptTarget{{5, 100}})

	// Stage 110, then a lighter 105 (still > target 100) must NOT downgrade it.
	ps.SuggestTargets(uid, pid, []stores.ProgressInput{{ProgramSetID: ids[0], Weight: 110, Reps: 5}})
	_, count, _, _ := ps.SuggestTargets(uid, pid, []stores.ProgressInput{{ProgramSetID: ids[0], Weight: 105, Reps: 5}})
	if count != 0 {
		t.Errorf("count = %d, want 0 (105 shouldn't overwrite pending 110)", count)
	}
	if _, w, _, _ := getSuggestion(t, ids[0]); w != 110 {
		t.Errorf("pending suggestion = %.1f, want 110 (not downgraded)", w)
	}
	// A bigger 115 does overwrite.
	_, count2, _, _ := ps.SuggestTargets(uid, pid, []stores.ProgressInput{{ProgramSetID: ids[0], Weight: 115, Reps: 5}})
	if count2 != 1 {
		t.Errorf("count = %d, want 1 (115 overwrites pending 110)", count2)
	}
	if _, w, _, _ := getSuggestion(t, ids[0]); w != 115 {
		t.Errorf("pending suggestion = %.1f, want 115", w)
	}
}

// A lighter set never stages a suggestion, even with more reps (weight-first rule).
func TestSuggestTargets_NeverLowers(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	uid := createTestUser(t)
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, uid, exID, []ptTarget{{8, 100}})

	_, count, _, err := ps.SuggestTargets(uid, pid, []stores.ProgressInput{{ProgramSetID: ids[0], Weight: 95, Reps: 12}})
	if err != nil {
		t.Fatalf("SuggestTargets: %v", err)
	}
	if count != 0 {
		t.Errorf("count = %d, want 0", count)
	}
	if _, _, _, ok := getSuggestion(t, ids[0]); ok {
		t.Errorf("no suggestion expected for a lighter set")
	}
}

// Ownership + program-join guard (IDOR): a user cannot stage onto another user's routine.
func TestSuggestTargets_OwnershipGuard(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	owner := createTestUser(t)
	attacker := insertUser(t, "attacker@example.com")
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, owner, exID, []ptTarget{{5, 100}})

	// attacker uses the owner's program id → ownership gate → no-op.
	name, count, _, err := ps.SuggestTargets(attacker, pid, []stores.ProgressInput{{ProgramSetID: ids[0], Weight: 999, Reps: 99}})
	if err != nil || name != "" || count != 0 {
		t.Errorf("victim-program call = (%q, %d, %v), want (\"\", 0, nil)", name, count, err)
	}
	// attacker's own program + owner's set id → join fails → no-op.
	p2, _ := seedProgram(t, attacker, exID, []ptTarget{{5, 50}})
	_, count2, _, _ := ps.SuggestTargets(attacker, p2, []stores.ProgressInput{{ProgramSetID: ids[0], Weight: 999, Reps: 99}})
	if count2 != 0 {
		t.Errorf("cross-program count = %d, want 0", count2)
	}
	if _, _, _, ok := getSuggestion(t, ids[0]); ok {
		t.Fatalf("owner's set got a suggestion — IDOR!")
	}
}

// ResolveSuggestions: accept copies suggestion→target + clears; dismiss clears only.
func TestResolveSuggestions_AcceptAndDismiss(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	uid := createTestUser(t)
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, uid, exID, []ptTarget{{5, 100}, {5, 100}})

	if _, count, _, err := ps.SuggestTargets(uid, pid, []stores.ProgressInput{
		{ProgramSetID: ids[0], Weight: 105, Reps: 5},
		{ProgramSetID: ids[1], Weight: 110, Reps: 5},
	}); err != nil || count != 2 {
		t.Fatalf("stage: count=%d err=%v", count, err)
	}

	// Accept set0, dismiss set1.
	prog, err := ps.ResolveSuggestions(uid, pid, []int64{ids[0]}, []int64{ids[1]})
	if err != nil {
		t.Fatalf("ResolveSuggestions: %v", err)
	}
	if len(prog.Exercises) != 1 {
		t.Fatalf("expected 1 exercise, got %d", len(prog.Exercises))
	}
	// set0: target applied to 105, suggestion cleared.
	if r, w := getTarget(t, ids[0]); r != 5 || w != 105 {
		t.Errorf("accepted target = %d×%.1f, want 5×105", r, w)
	}
	if _, _, _, ok := getSuggestion(t, ids[0]); ok {
		t.Errorf("accepted suggestion should be cleared")
	}
	// set1: target unchanged, suggestion cleared.
	if r, w := getTarget(t, ids[1]); r != 5 || w != 100 {
		t.Errorf("dismissed target = %d×%.1f, want 5×100 (unchanged)", r, w)
	}
	if _, _, _, ok := getSuggestion(t, ids[1]); ok {
		t.Errorf("dismissed suggestion should be cleared")
	}
}

// ResolveSuggestions ignores ids that aren't in the caller's program (ownership/IDOR).
func TestResolveSuggestions_OwnershipGuard(t *testing.T) {
	setupTestDB(t)
	ps := stores.NewProgramStore(db.DB)
	owner := createTestUser(t)
	attacker := insertUser(t, "attacker@example.com")
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, owner, exID, []ptTarget{{5, 100}})
	if _, count, _, _ := ps.SuggestTargets(owner, pid, []stores.ProgressInput{{ProgramSetID: ids[0], Weight: 105, Reps: 5}}); count != 1 {
		t.Fatalf("stage failed")
	}

	// attacker's own program, tries to accept the owner's staged set id → join fails → no-op.
	p2, _ := seedProgram(t, attacker, exID, []ptTarget{{5, 50}})
	if _, err := ps.ResolveSuggestions(attacker, p2, []int64{ids[0]}, nil); err != nil {
		t.Fatalf("ResolveSuggestions(attacker): %v", err)
	}
	if r, w := getTarget(t, ids[0]); r != 5 || w != 100 {
		t.Fatalf("owner's target mutated to %d×%.1f — IDOR!", r, w)
	}
	if _, _, _, ok := getSuggestion(t, ids[0]); !ok {
		t.Errorf("owner's staged suggestion should be untouched by the attacker")
	}
}

// CreateWorkout with a program_id goes through CreateWorkoutWithProgression (the
// merged-transaction path, issue #40 progression review) end-to-end: a beaten,
// routine-linked set stages a suggestion and the response's progression summary
// reflects it.
func TestCreateWorkout_StagesProgressionSuggestion(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, uid, exID, []ptTarget{{5, 100}})

	body := map[string]any{
		"name":       "Push A",
		"duration":   1800,
		"program_id": pid,
		"exercises": []map[string]any{
			{
				"exercise_id": exID,
				"sets": []map[string]any{
					{"set_number": 1, "reps": 5, "weight": 105.0, "program_set_id": ids[0]},
				},
			},
		},
	}

	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	prog, ok := data["progression"].(map[string]any)
	if !ok {
		t.Fatalf("expected progression in response, got %v", data["progression"])
	}
	if count, _ := prog["count"].(float64); count != 1 {
		t.Errorf("progression count = %v, want 1", prog["count"])
	}
	if isPR, _ := prog["is_pr"].(bool); !isPR {
		t.Errorf("progression is_pr = %v, want true", prog["is_pr"])
	}
	// The staged suggestion is durably persisted on program_sets, not just echoed
	// on the response (regression: merging the snapshot/insert/staging transactions
	// must still leave a fully-committed suggestion, not a partial one).
	if r, wt, pr, ok := getSuggestion(t, ids[0]); !ok || r != 5 || wt != 105 || !pr {
		t.Errorf("staged suggestion = (%d×%.1f pr=%v ok=%v), want 5×105 pr=true", r, wt, pr, ok)
	}
}

// If suggestion-staging errors mid-transaction, CreateWorkoutWithProgression's
// SAVEPOINT/ROLLBACK TO SAVEPOINT must undo only staging's own writes and let the
// already-inserted workout commit (per the "best-effort" doc comment on
// CreateWorkoutWithProgression) — never let pErr propagate up through inTxDo and
// roll back the whole transaction, silently discarding the user's workout.
func TestCreateWorkout_progressionStagingFailureStillSavesWorkout(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)
	pid, ids := seedProgram(t, uid, exID, []ptTarget{{5, 100}})

	// Force suggestion-staging to hit a real DB error (not the benign sql.ErrNoRows
	// the code already tolerates) by pulling program_sets out from under it — the
	// per-set SELECT in suggestTargetsTx joins that table, so this fails the staging
	// step without touching workouts/workout_exercises/sets at all.
	if _, err := db.DB.Exec(`ALTER TABLE program_sets RENAME TO program_sets_gone`); err != nil {
		t.Fatalf("rename program_sets: %v", err)
	}

	body := map[string]any{
		"name":       "Push A",
		"duration":   1800,
		"program_id": pid,
		"exercises": []map[string]any{
			{
				"exercise_id": exID,
				"sets": []map[string]any{
					{"set_number": 1, "reps": 5, "weight": 105.0, "program_set_id": ids[0]},
				},
			},
		},
	}

	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 even though staging failed, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	if data["progression"] != nil {
		t.Errorf("progression = %v, want nil — staging failed, so nothing was staged", data["progression"])
	}

	var count int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM workouts WHERE user_id = ?`, uid).Scan(&count); err != nil {
		t.Fatalf("count workouts: %v", err)
	}
	if count != 1 {
		t.Fatalf("workout count = %d, want 1 — a staging failure must not roll back the outer transaction", count)
	}
}

// CreateWorkoutRequest.Exercises carries validate:"max=500,dive" specifically so the
// nested per-exercise Sets cap (also max=500) is enforced too — go-playground/validator
// only recurses into a struct slice's own element tags when the outer slice is
// `dive`-tagged. A single exercise with an oversized Sets array must be rejected before
// it ever reaches CreateWorkoutWithProgression's single-connection transaction.
func TestCreateWorkout_RejectsOversizedSets(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	sets := make([]map[string]any, 501)
	for i := range sets {
		sets[i] = map[string]any{"set_number": i + 1, "reps": 5, "weight": 100.0}
	}
	body := map[string]any{
		"name":     "Push A",
		"duration": 1800,
		"exercises": []map[string]any{
			{"exercise_id": exID, "sets": sets},
		},
	}

	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for a 501-set exercise, got %d: %s", w.Code, w.Body.String())
	}
}

// Exercises and Sets each cap at max=500 independently, which doesn't bound their
// product: many exercises with a handful of sets each can still add up to more total
// rows than CreateWorkoutWithProgression's single-connection transaction should ever
// process for one request. The struct-level total-sets check (models.MaxWorkoutSets)
// must reject that even though no single list crosses its own max=500.
func TestCreateWorkout_RejectsOversizedTotalSets(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	// 21 exercises x 25 sets = 525 total sets, over MaxWorkoutSets (500), while every
	// individual list (21 exercises, 25 sets) stays well under its own max=500.
	exercises := make([]map[string]any, 21)
	for i := range exercises {
		sets := make([]map[string]any, 25)
		for j := range sets {
			sets[j] = map[string]any{"set_number": j + 1, "reps": 5, "weight": 100.0}
		}
		exercises[i] = map[string]any{"exercise_id": exID, "sets": sets}
	}
	body := map[string]any{
		"name":      "Push A",
		"duration":  1800,
		"exercises": exercises,
	}

	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for 525 total sets across exercises, got %d: %s", w.Code, w.Body.String())
	}
}

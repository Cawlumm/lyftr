package stores

import (
	"database/sql"
	"log"

	"github.com/Cawlumm/lyftr-backend/models"
)

// CreateWorkoutWithProgression creates a workout and, if it came from a routine,
// stages auto-progression suggestions (issue #40) for the sets the user beat — all in
// ONE transaction.
//
// The PR-snapshot read (what's the current best for each exercise), the workout
// insert, and the suggestion-staging write used to run as separate transactions
// (snapshot read → Workout.Create → progressRoutine/SuggestTargets). Two concurrent
// workout submissions for the same exercise could both read the identical "prior
// best" before either committed, so both could get flagged suggested_is_pr = true
// even though only the one that actually committed last was the genuine all-time
// best. Reading the prior best and staging the suggestion inside the same
// transaction as the insert lets SQLite's writer-serialization close that race: a
// concurrent commit landing between this transaction's snapshot read and its own
// commit now fails this transaction outright (surfaced as a DB error) rather than
// silently persisting a wrong PR flag.
//
// Suggestion-staging stays best-effort: if it errors, the error is logged and
// dropped so the already-inserted workout still commits — never fail a save the
// user is waiting on because routine bookkeeping hiccuped. Its (possibly partial)
// writes are rolled back via a SAVEPOINT rather than left committed, so "dropped"
// stays true even now that staging shares a transaction with the insert.
//
// This does widen the critical section: with db.DB.SetMaxOpenConns(1), the whole
// PR-snapshot + insert + suggestion-staging sequence now holds the process's one
// connection for its full duration instead of releasing it between the three
// steps. That's an accepted tradeoff for closing the TOCTOU race above — the race
// specifically requires the snapshot read and the dependent write to be
// serialized — not an oversight. Exercises and Sets each independently capping at
// max=500 (models.go) does NOT bound that widened section, since it bounds each
// dimension separately, not their product — the actual bound is the total-sets
// struct-level validation (models.MaxWorkoutSets, enforced in
// controllers/workouts.go's init()), which caps sum(len(Exercises[i].Sets)) across
// the whole request.
func (s *Stores) CreateWorkoutWithProgression(uid int64, req models.CreateWorkoutRequest) (models.Workout, *models.ProgressionResult, error) {
	var wid int64
	var progression *models.ProgressionResult
	err := inTxDo(s.db, func(tx *sql.Tx) error {
		priors := snapshotPRsTx(tx, uid, req)

		id, err := createWorkoutTx(tx, uid, req)
		if err != nil {
			return err
		}
		wid = id

		// Run suggestion-staging under its own SAVEPOINT: a mid-loop error must only
		// undo staging's own (possibly partial) UPDATEs, never the workout insert above.
		if _, spErr := tx.Exec("SAVEPOINT suggest_targets"); spErr != nil {
			log.Printf("[workouts/progress] uid=%d: savepoint: %v", uid, spErr)
			return nil
		}
		p, pErr := progressRoutineTx(tx, uid, req, priors)
		if pErr != nil {
			log.Printf("[workouts/progress] uid=%d: %v", uid, pErr)
			if _, rbErr := tx.Exec("ROLLBACK TO SAVEPOINT suggest_targets"); rbErr != nil {
				// The savepoint rollback itself failed, so staging's partial writes
				// can no longer be undone in isolation — fail the whole transaction
				// (the outer inTxDo rolls everything back) rather than let it commit
				// with partially-applied suggestion writes the caller was told about
				// as "dropped".
				log.Printf("[workouts/progress] uid=%d: rollback savepoint: %v", uid, rbErr)
				return rbErr
			}
			return nil
		}
		progression = p
		if _, relErr := tx.Exec("RELEASE SAVEPOINT suggest_targets"); relErr != nil {
			log.Printf("[workouts/progress] uid=%d: release savepoint: %v", uid, relErr)
		}
		return nil
	})
	if err != nil {
		return models.Workout{}, nil, err
	}
	w, err := s.Workout.get(wid)
	if err != nil {
		return models.Workout{}, nil, err
	}
	return w, progression, nil
}

// snapshotPRsTx records each routine exercise's current best (weight desc, then
// reps) before the workout is saved, so is-PR can be judged against the prior best.
// Empty for freestyle workouts. A missing PR (no rows) is recorded as absent.
func snapshotPRsTx(tx *sql.Tx, uid int64, req models.CreateWorkoutRequest) map[int64]*ExercisePR {
	if req.ProgramID == nil {
		return nil
	}
	priors := make(map[int64]*ExercisePR)
	for _, ex := range req.Exercises {
		if _, seen := priors[ex.ExerciseID]; seen {
			continue
		}
		pr, err := prForExerciseTx(tx, uid, ex.ExerciseID)
		if err != nil {
			priors[ex.ExerciseID] = nil // no prior best (first time) or lookup failed
			continue
		}
		p := pr
		priors[ex.ExerciseID] = &p
	}
	return priors
}

// progressRoutineTx stages a target suggestion for each set the user beat, flagging
// all-time PRs, and returns a summary for the finish toast (nil if nothing staged or
// the workout wasn't from a routine). Only sets carrying a program_set_id count; the
// store enforces ownership.
func progressRoutineTx(tx *sql.Tx, uid int64, req models.CreateWorkoutRequest, priors map[int64]*ExercisePR) (*models.ProgressionResult, error) {
	if req.ProgramID == nil {
		return nil, nil
	}
	const eps = 1e-6
	var inputs []ProgressInput
	for _, ex := range req.Exercises {
		for _, st := range ex.Sets {
			if st.ProgramSetID == nil || st.IsWarmup {
				continue
			}
			prior := priors[ex.ExerciseID]
			isPR := prior == nil ||
				st.Weight > prior.Weight+eps ||
				(st.Weight >= prior.Weight-eps && st.Reps > prior.Reps)
			inputs = append(inputs, ProgressInput{
				ProgramSetID: *st.ProgramSetID,
				Weight:       st.Weight,
				Reps:         st.Reps,
				IsPR:         isPR,
			})
		}
	}
	if len(inputs) == 0 {
		return nil, nil
	}
	name, count, anyPR, err := suggestTargetsTx(tx, uid, *req.ProgramID, inputs)
	if err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, nil
	}
	return &models.ProgressionResult{ProgramID: *req.ProgramID, ProgramName: name, Count: count, IsPR: anyPR}, nil
}

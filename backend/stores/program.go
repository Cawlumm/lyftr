package stores

import (
	"database/sql"
	"strings"

	"github.com/Cawlumm/lyftr-backend/models"
)

// ProgramStore owns all SQL for programs, program_exercises and program_sets.
type ProgramStore struct{ db *sql.DB }

func NewProgramStore(db *sql.DB) *ProgramStore { return &ProgramStore{db: db} }

// ProgramFilter holds list paging + optional name search.
type ProgramFilter struct {
	Limit, Offset int
	Query         string
}

const programCols = `id, user_id, name, notes, created_at`

func scanProgram(row interface{ Scan(...any) error }, p *models.Program) error {
	return row.Scan(&p.ID, &p.UserID, &p.Name, &p.Notes, &p.CreatedAt)
}

func (s *ProgramStore) List(uid int64, f ProgramFilter) ([]models.Program, error) {
	var rows *sql.Rows
	var err error
	if f.Query != "" {
		rows, err = s.db.Query(
			`SELECT `+programCols+` FROM programs WHERE user_id = ? AND LOWER(name) LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
			uid, "%"+strings.ToLower(f.Query)+"%", f.Limit, f.Offset,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT `+programCols+` FROM programs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
			uid, f.Limit, f.Offset,
		)
	}
	if err != nil {
		return nil, err
	}
	programs := []models.Program{}
	for rows.Next() {
		var p models.Program
		if err := scanProgram(rows, &p); err != nil {
			rows.Close()
			return nil, err
		}
		programs = append(programs, p)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close() // close the parent cursor BEFORE loading children (#36)

	for i := range programs {
		ex, err := s.loadExercises(programs[i].ID)
		if err != nil {
			return nil, err
		}
		programs[i].Exercises = ex
	}
	return programs, nil
}

// Get returns a user-owned program with its exercises/sets, or sql.ErrNoRows.
func (s *ProgramStore) Get(uid, id int64) (models.Program, error) {
	var p models.Program
	if err := scanProgram(
		s.db.QueryRow(`SELECT `+programCols+` FROM programs WHERE id = ? AND user_id = ?`, id, uid), &p,
	); err != nil {
		return models.Program{}, err
	}
	ex, err := s.loadExercises(id)
	if err != nil {
		return models.Program{}, err
	}
	p.Exercises = ex
	return p, nil
}

func (s *ProgramStore) get(id int64) (models.Program, error) {
	var p models.Program
	if err := scanProgram(s.db.QueryRow(`SELECT `+programCols+` FROM programs WHERE id = ?`, id), &p); err != nil {
		return models.Program{}, err
	}
	ex, err := s.loadExercises(id)
	if err != nil {
		return models.Program{}, err
	}
	p.Exercises = ex
	return p, nil
}

func (s *ProgramStore) Create(uid int64, req models.CreateProgramRequest) (models.Program, error) {
	pid, err := inTx(s.db, func(tx *sql.Tx) (int64, error) {
		res, err := tx.Exec(`INSERT INTO programs (user_id, name, notes) VALUES (?, ?, ?)`, uid, req.Name, req.Notes)
		if err != nil {
			return 0, err
		}
		pid, err := res.LastInsertId()
		if err != nil {
			return 0, err
		}
		if err := insertProgramExercises(tx, pid, req.Exercises); err != nil {
			return 0, err
		}
		return pid, nil
	})
	if err != nil {
		return models.Program{}, err
	}
	return s.get(pid)
}

// Update replaces a user-owned program and its children in one tx. sql.ErrNoRows
// if the program isn't theirs (nothing is mutated).
func (s *ProgramStore) Update(uid, id int64, req models.CreateProgramRequest) (models.Program, error) {
	if err := inTxDo(s.db, func(tx *sql.Tx) error {
		var ownedID int64
		if err := tx.QueryRow(`SELECT id FROM programs WHERE id = ? AND user_id = ?`, id, uid).Scan(&ownedID); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE programs SET name = ?, notes = ? WHERE id = ?`, req.Name, req.Notes, id); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM program_exercises WHERE program_id = ?`, id); err != nil {
			return err
		}
		return insertProgramExercises(tx, id, req.Exercises)
	}); err != nil {
		return models.Program{}, err
	}
	return s.get(id)
}

// ProgressInput is one logged working set to consider for auto-progression:
// the routine set it came from, what the user logged, and whether that logged set
// was also an all-time best (computed by the controller from a pre-save PR snapshot).
type ProgressInput struct {
	ProgramSetID int64
	Weight       float64
	Reps         int
	IsPR         bool
}

// SuggestTargets stages (does NOT apply) a per-set target suggestion for each set the
// user beat this workout (issue #40). The user later approves them on the routine via
// ResolveSuggestions. Upward only, per progressedTarget. Returns the routine name, how
// many suggestions were staged, and whether any was an all-time PR (drives the 🏆
// toast). If the program isn't the caller's, nothing is touched (name "", count 0, no
// error): the ownership check + the pe.program_id join stop a client from staging onto
// another user's routine by guessing set ids.
func (s *ProgramStore) SuggestTargets(uid, programID int64, sets []ProgressInput) (string, int, bool, error) {
	var name string
	var count int
	var anyPR bool
	err := inTxDo(s.db, func(tx *sql.Tx) error {
		var err error
		name, count, anyPR, err = suggestTargetsTx(tx, uid, programID, sets)
		return err
	})
	if err != nil {
		return "", 0, false, err
	}
	return name, count, anyPR, nil
}

// suggestTargetsTx is SuggestTargets' body, scoped to an existing transaction so a
// caller can serialize it with an earlier PR-snapshot read and workout insert (see
// WorkoutStore.CreateWithProgression) — closes a TOCTOU race where two concurrent
// workout submissions could both compute suggested_is_pr against the same stale prior
// best (issue #40 progression review).
func suggestTargetsTx(tx *sql.Tx, uid, programID int64, sets []ProgressInput) (string, int, bool, error) {
	var name string
	count, anyPR := 0, false
	if err := tx.QueryRow(`SELECT name FROM programs WHERE id = ? AND user_id = ?`, programID, uid).Scan(&name); err != nil {
		if err == sql.ErrNoRows {
			return "", 0, false, nil // not the caller's program — no-op, not an error
		}
		return "", 0, false, err
	}
	for _, in := range sets {
		var curReps int
		var curWeight float64
		var sugReps sql.NullInt64
		var sugWeight sql.NullFloat64
		// Re-assert the set belongs to THIS (already-owned) program before touching it.
		err := tx.QueryRow(
			`SELECT ps.target_reps, ps.target_weight, ps.suggested_reps, ps.suggested_weight
			 FROM program_sets ps
			 JOIN program_exercises pe ON pe.id = ps.program_exercise_id
			 WHERE ps.id = ? AND pe.program_id = ?`,
			in.ProgramSetID, programID,
		).Scan(&curReps, &curWeight, &sugReps, &sugWeight)
		if err == sql.ErrNoRows {
			continue // set isn't in this routine anymore (edited/deleted) — skip
		}
		if err != nil {
			return "", 0, false, err
		}
		// Compare against the best of (current target, any pending suggestion) so a
		// smaller-but-still-over-target set can't downgrade an un-approved PR (#40 edge).
		baseReps, baseWeight := curReps, curWeight
		if sugReps.Valid {
			baseReps = int(sugReps.Int64)
		}
		if sugWeight.Valid {
			baseWeight = sugWeight.Float64
		}
		newWeight, newReps, improved := progressedTarget(baseWeight, baseReps, in.Weight, in.Reps)
		if !improved {
			continue
		}
		if _, err := tx.Exec(
			`UPDATE program_sets SET suggested_weight = ?, suggested_reps = ?, suggested_is_pr = ? WHERE id = ?`,
			newWeight, newReps, in.IsPR, in.ProgramSetID,
		); err != nil {
			return "", 0, false, err
		}
		count++
		if in.IsPR {
			anyPR = true
		}
	}
	return name, count, anyPR, nil
}

// ResolveSuggestions applies (accept) or clears (dismiss) staged routine suggestions by
// program_set id, then returns the refreshed program. Accepting copies suggested_* into
// target_*; both paths clear the suggestion. Ownership-gated, and every id is re-scoped
// to this program via the pe.program_id sub-select — the same IDOR guard as SuggestTargets,
// so a client can't touch another user's routine by guessing ids.
func (s *ProgramStore) ResolveSuggestions(uid, programID int64, accept, dismiss []int64) (models.Program, error) {
	err := inTxDo(s.db, func(tx *sql.Tx) error {
		var ownedID int64
		if err := tx.QueryRow(`SELECT id FROM programs WHERE id = ? AND user_id = ?`, programID, uid).Scan(&ownedID); err != nil {
			return err
		}
		owned := `AND program_exercise_id IN (SELECT id FROM program_exercises WHERE program_id = ?)`
		for _, id := range accept {
			if _, err := tx.Exec(
				`UPDATE program_sets
				 SET target_weight = COALESCE(suggested_weight, target_weight),
				     target_reps   = COALESCE(suggested_reps, target_reps),
				     suggested_weight = NULL, suggested_reps = NULL, suggested_is_pr = 0
				 WHERE id = ? `+owned,
				id, programID,
			); err != nil {
				return err
			}
		}
		for _, id := range dismiss {
			if _, err := tx.Exec(
				`UPDATE program_sets
				 SET suggested_weight = NULL, suggested_reps = NULL, suggested_is_pr = 0
				 WHERE id = ? `+owned,
				id, programID,
			); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return models.Program{}, err
	}
	return s.get(programID)
}

// progressedTarget applies the upward-only progression rule for a single set and
// reports whether the target changed: a heavier logged weight raises the weight
// and adopts the reps done at it; the same weight with more reps raises the reps;
// equal-or-lighter leaves the target untouched (a deload never lowers a routine).
// eps absorbs float drift from unit conversion so an unchanged weight still counts
// as "same" for the reps branch.
func progressedTarget(curWeight float64, curReps int, logWeight float64, logReps int) (float64, int, bool) {
	const eps = 1e-6
	switch {
	case logWeight > curWeight+eps:
		return logWeight, logReps, true
	case logWeight >= curWeight-eps && logReps > curReps:
		return curWeight, logReps, true
	default:
		return curWeight, curReps, false
	}
}

func (s *ProgramStore) Delete(uid, id int64) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM programs WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

func insertProgramExercises(tx *sql.Tx, pid int64, exercises []models.CreateProgramExerciseReq) error {
	for i, ex := range exercises {
		exRes, err := tx.Exec(
			`INSERT INTO program_exercises (program_id, exercise_id, order_index, notes, rest_seconds) VALUES (?, ?, ?, ?, ?)`,
			pid, ex.ExerciseID, i, ex.Notes, ex.RestSeconds,
		)
		if err != nil {
			return err
		}
		peid, err := exRes.LastInsertId()
		if err != nil {
			return err
		}
		for j, st := range ex.Sets {
			sn := st.SetNumber
			if sn == 0 {
				sn = j + 1
			}
			if _, err := tx.Exec(
				`INSERT INTO program_sets (program_exercise_id, set_number, target_reps, target_weight) VALUES (?, ?, ?, ?)`,
				peid, sn, st.TargetReps, st.TargetWeight,
			); err != nil {
				return err
			}
		}
	}
	return nil
}

// loadExercises scans + closes the parent cursor BEFORE loading each exercise's
// sets (#36), and surfaces scan errors.
func (s *ProgramStore) loadExercises(programID int64) ([]models.ProgramExercise, error) {
	rows, err := s.db.Query(
		`SELECT pe.id, pe.program_id, pe.exercise_id, pe.order_index, pe.notes, pe.rest_seconds,
		        e.name, e.muscle_group, e.category, e.equipment, e.image_url
		 FROM program_exercises pe
		 JOIN exercises e ON e.id = pe.exercise_id
		 WHERE pe.program_id = ? ORDER BY pe.order_index`,
		programID,
	)
	if err != nil {
		return nil, err
	}
	var exercises []models.ProgramExercise
	for rows.Next() {
		var pe models.ProgramExercise
		if err := rows.Scan(
			&pe.ID, &pe.ProgramID, &pe.ExerciseID, &pe.OrderIndex, &pe.Notes, &pe.RestSeconds,
			&pe.Exercise.Name, &pe.Exercise.MuscleGroup, &pe.Exercise.Category,
			&pe.Exercise.Equipment, &pe.Exercise.ImageURL,
		); err != nil {
			rows.Close()
			return nil, err
		}
		pe.Exercise.ID = pe.ExerciseID
		exercises = append(exercises, pe)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	for i := range exercises {
		sets, err := s.loadSets(exercises[i].ID)
		if err != nil {
			return nil, err
		}
		exercises[i].Sets = sets
	}
	return exercises, nil
}

func (s *ProgramStore) loadSets(programExerciseID int64) ([]models.ProgramSet, error) {
	rows, err := s.db.Query(
		`SELECT id, program_exercise_id, set_number, target_reps, target_weight,
		        suggested_weight, suggested_reps, suggested_is_pr
		 FROM program_sets WHERE program_exercise_id = ? ORDER BY set_number`,
		programExerciseID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sets []models.ProgramSet
	for rows.Next() {
		var st models.ProgramSet
		var sw sql.NullFloat64
		var sr sql.NullInt64
		if err := rows.Scan(&st.ID, &st.ProgramExerciseID, &st.SetNumber, &st.TargetReps, &st.TargetWeight,
			&sw, &sr, &st.SuggestedIsPR); err != nil {
			return nil, err
		}
		if sw.Valid {
			st.SuggestedWeight = &sw.Float64
		}
		if sr.Valid {
			r := int(sr.Int64)
			st.SuggestedReps = &r
		}
		sets = append(sets, st)
	}
	return sets, rows.Err()
}

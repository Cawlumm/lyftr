package stores

import (
	"database/sql"
	"strings"

	"github.com/Cawlumm/lyftr-backend/models"
)

// ProgramStore owns all SQL for programs, program_days, program_exercises and
// program_sets.
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
		if err := s.hydrate(&programs[i]); err != nil {
			return nil, err
		}
	}
	return programs, nil
}

// Get returns a user-owned program with its days/exercises/sets, or sql.ErrNoRows.
func (s *ProgramStore) Get(uid, id int64) (models.Program, error) {
	var p models.Program
	if err := scanProgram(
		s.db.QueryRow(`SELECT `+programCols+` FROM programs WHERE id = ? AND user_id = ?`, id, uid), &p,
	); err != nil {
		return models.Program{}, err
	}
	if err := s.hydrate(&p); err != nil {
		return models.Program{}, err
	}
	return p, nil
}

func (s *ProgramStore) get(id int64) (models.Program, error) {
	var p models.Program
	if err := scanProgram(s.db.QueryRow(`SELECT `+programCols+` FROM programs WHERE id = ?`, id), &p); err != nil {
		return models.Program{}, err
	}
	if err := s.hydrate(&p); err != nil {
		return models.Program{}, err
	}
	return p, nil
}

// hydrate loads a program's Days (with their Exercises/Sets) and computes
// CurrentDayIndex in place.
func (s *ProgramStore) hydrate(p *models.Program) error {
	days, err := s.loadDays(p.ID)
	if err != nil {
		return err
	}
	p.Days = days
	idx, err := s.currentDayIndex(p.ID, days)
	if err != nil {
		return err
	}
	p.CurrentDayIndex = idx
	return nil
}

// currentDayIndex is which Days[] entry is due today. A rest day never produces a
// loggable workout, so it can't be counted the same way a workout day is: naively
// taking COUNT(workouts) MOD cycleLen treats every slot (workout or rest) as equally
// "consumed" by a log, which desyncs the moment a rest day sits between two workout
// days (nothing ever advances the count while a rest slot is "current", and a slot
// right after a workout gets misread once the count catches up).
//
// Instead, map the count of logged workouts onto the WORKOUT-only subsequence
// (rest days are skipped when building it — they're consumed for free by whichever
// workout is logged around them): the Nth logged workout (1-indexed, cycling through
// that subsequence) is read as "we've just finished the day at
// workoutOrderIndices[(N-1) % len(workoutOrderIndices)]", so the due day is the very
// next slot after it, wrapped into the full cycle. 0 workouts logged, or a program
// with no workout days at all (every day is rest, or no days yet), means slot 0 is
// due (nothing done yet / nothing to be "due").
func (s *ProgramStore) currentDayIndex(programID int64, days []models.ProgramDay) (int, error) {
	cycleLen := len(days)
	if cycleLen == 0 {
		return 0, nil
	}
	workoutOrderIndices := make([]int, 0, cycleLen)
	for _, d := range days {
		if !d.IsRestDay {
			workoutOrderIndices = append(workoutOrderIndices, d.OrderIndex)
		}
	}
	if len(workoutOrderIndices) == 0 {
		return 0, nil
	}
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM workouts WHERE program_id = ?`, programID).Scan(&count); err != nil {
		return 0, err
	}
	if count == 0 {
		return 0, nil
	}
	lastDone := workoutOrderIndices[(count-1)%len(workoutOrderIndices)]
	return (lastDone + 1) % cycleLen, nil
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
		if err := insertProgramDays(tx, pid, req.Days); err != nil {
			return 0, err
		}
		return pid, nil
	})
	if err != nil {
		return models.Program{}, err
	}
	return s.get(pid)
}

// Update replaces a user-owned program and its days/exercises/sets in one tx.
// sql.ErrNoRows if the program isn't theirs (nothing is mutated).
func (s *ProgramStore) Update(uid, id int64, req models.CreateProgramRequest) (models.Program, error) {
	if err := inTxDo(s.db, func(tx *sql.Tx) error {
		var ownedID int64
		if err := tx.QueryRow(`SELECT id FROM programs WHERE id = ? AND user_id = ?`, id, uid).Scan(&ownedID); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE programs SET name = ?, notes = ? WHERE id = ?`, req.Name, req.Notes, id); err != nil {
			return err
		}
		// Deleting the Days cascades to program_exercises (program_day_id FK) which
		// cascades to program_sets (program_exercise_id FK) — same layered cascade the
		// flat model relied on, just one level deeper.
		if _, err := tx.Exec(`DELETE FROM program_days WHERE program_id = ?`, id); err != nil {
			return err
		}
		return insertProgramDays(tx, id, req.Days)
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
// best (issue #40 progression review). program_exercises keeps a denormalized
// program_id column (alongside program_day_id) specifically so this join — and the
// ownership guard below — never had to change when routines grew a day layer.
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

// insertProgramDays writes a program's Days (in request order — OrderIndex on the
// request is trusted as-is, matching the pre-existing convention for exercise/set
// ordering) plus each Day's exercises/sets within tx.
func insertProgramDays(tx *sql.Tx, programID int64, days []models.CreateProgramDayReq) error {
	for i, day := range days {
		// Request array position is authoritative for ordering (same convention as
		// insertProgramExercises' `i`, not a client-echoed value) — a client resending
		// a stale/duplicate order_index can't scramble the cycle order.
		dayRes, err := tx.Exec(
			`INSERT INTO program_days (program_id, order_index, is_rest_day, name) VALUES (?, ?, ?, ?)`,
			programID, i, day.IsRestDay, day.Name,
		)
		if err != nil {
			return err
		}
		dayID, err := dayRes.LastInsertId()
		if err != nil {
			return err
		}
		if day.IsRestDay {
			continue // rest days never carry exercises, even if the client sent some
		}
		if err := insertProgramExercises(tx, programID, dayID, day.Exercises); err != nil {
			return err
		}
	}
	return nil
}

func insertProgramExercises(tx *sql.Tx, programID, dayID int64, exercises []models.CreateProgramExerciseReq) error {
	for i, ex := range exercises {
		exRes, err := tx.Exec(
			`INSERT INTO program_exercises (program_id, program_day_id, exercise_id, order_index, notes, rest_seconds) VALUES (?, ?, ?, ?, ?, ?)`,
			programID, dayID, ex.ExerciseID, i, ex.Notes, ex.RestSeconds,
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

// loadDays scans + closes the parent cursor BEFORE loading each day's exercises
// (#36 — same close-then-load discipline as loadExercises/loadSets below).
func (s *ProgramStore) loadDays(programID int64) ([]models.ProgramDay, error) {
	rows, err := s.db.Query(
		`SELECT id, program_id, order_index, is_rest_day, name FROM program_days WHERE program_id = ? ORDER BY order_index`,
		programID,
	)
	if err != nil {
		return nil, err
	}
	days := []models.ProgramDay{}
	for rows.Next() {
		var d models.ProgramDay
		var isRest int
		if err := rows.Scan(&d.ID, &d.ProgramID, &d.OrderIndex, &isRest, &d.Name); err != nil {
			rows.Close()
			return nil, err
		}
		d.IsRestDay = isRest != 0
		days = append(days, d)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	for i := range days {
		if days[i].IsRestDay {
			days[i].Exercises = []models.ProgramExercise{}
			continue
		}
		ex, err := s.loadExercises(days[i].ID)
		if err != nil {
			return nil, err
		}
		days[i].Exercises = ex
	}
	return days, nil
}

// loadExercises scans + closes the parent cursor BEFORE loading each exercise's
// sets (#36), and surfaces scan errors.
func (s *ProgramStore) loadExercises(dayID int64) ([]models.ProgramExercise, error) {
	rows, err := s.db.Query(
		`SELECT pe.id, pe.program_day_id, pe.exercise_id, pe.order_index, pe.notes, pe.rest_seconds,
		        e.name, e.muscle_group, e.category, e.equipment, e.image_url
		 FROM program_exercises pe
		 JOIN exercises e ON e.id = pe.exercise_id
		 WHERE pe.program_day_id = ? ORDER BY pe.order_index`,
		dayID,
	)
	if err != nil {
		return nil, err
	}
	exercises := []models.ProgramExercise{}
	for rows.Next() {
		var pe models.ProgramExercise
		if err := rows.Scan(
			&pe.ID, &pe.ProgramDayID, &pe.ExerciseID, &pe.OrderIndex, &pe.Notes, &pe.RestSeconds,
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
	sets := []models.ProgramSet{}
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

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

	// loadDays (exercises/sets) stays a per-program call — pre-existing N+1, out of
	// scope here. currentDayIndex is batched below instead of called per-program:
	// unlike loadDays it added 2 brand-new sequential round trips per program on top
	// of that, and SetMaxOpenConns(1) serializes every one of them on the process's
	// single connection.
	for i := range programs {
		days, err := s.loadDays(programs[i].ID)
		if err != nil {
			return nil, err
		}
		programs[i].Days = days
	}
	idxByID, err := s.currentDayIndex(uid, programs)
	if err != nil {
		return nil, err
	}
	for i := range programs {
		programs[i].CurrentDayIndex = idxByID[programs[i].ID]
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
	idxByID, err := s.currentDayIndex(p.UserID, []models.Program{{ID: p.ID, Days: days}})
	if err != nil {
		return err
	}
	p.CurrentDayIndex = idxByID[p.ID]
	return nil
}

// currentDayIndex computes, for every given program, which Days[] entry is due
// today, in a small constant number of queries regardless of how many programs
// are passed (a single query via a CTE, whether called with one program from
// hydrate or a whole page of them from List — see ProgramStore.List). The due day
// is derived from WHICH specific day the most recently started program workout
// was logged against (workouts.program_day_id), not from a blind workout count —
// a count is blind to repeats and out-of-order logging, silently desyncing
// "today's workout" from what was actually done. The due day is the next workout
// day after the last-logged one in cycle order, wrapping to the first workout day
// past the end; rest days are never "due" and are skipped over. Repeating the
// same day therefore doesn't skip anything (due stays the next day in sequence),
// and logging an out-of-cycle day deliberately moves the tracker to whatever
// follows THAT day — no "remaining incomplete days" bookkeeping, by design.
//
// Only workouts whose program_day_id maps to one of THIS program's current non-rest
// days can anchor the tracker to a specific day; rows carrying a day from some other
// program are ignored outright. Rows with a NULL day and no dropped mark — clients
// that predate day tracking — can't anchor, but each one newer than the anchor still
// ADVANCES the tracker by one workout day, count-based: without that fallback a user
// on an older app build would log forever while the due day stayed parked, a
// regression from the pre-linkage COUNT-based algorithm which advanced on every
// workout. The exception is rows marked program_day_dropped (their day was
// deliberately deleted — or toggled into a rest day — by a routine edit): their
// cycle position is unknowable, and counting them as advances would let one edit
// swing the due day by the parity of an arbitrary lifetime count — deleting or
// rest-toggling a day with 50 logged workouts must not make "today's workout"
// depend on 50 mod cycle length. Dropped rows are ignored entirely. No qualifying
// workout at all → the first workout day is due. A program with no workout days
// (every day is rest, or no days yet) has nothing to be due → 0.
func (s *ProgramStore) currentDayIndex(uid int64, programs []models.Program) (map[int64]int, error) {
	result := make(map[int64]int, len(programs))
	workoutIdx := make(map[int64][]int, len(programs))
	progByID := make(map[int64]models.Program, len(programs))
	var ids []int64
	for _, p := range programs {
		progByID[p.ID] = p
		var idx []int
		for i, d := range p.Days {
			if !d.IsRestDay {
				idx = append(idx, i)
			}
		}
		if len(idx) == 0 {
			result[p.ID] = 0 // no workout days at all — nothing to be due
			continue
		}
		workoutIdx[p.ID] = idx
		ids = append(ids, p.ID)
	}
	if len(ids) == 0 {
		return result, nil
	}

	idSelects := make([]string, len(ids))
	inPlaceholders := make([]string, len(ids))
	for i := range ids {
		idSelects[i] = "SELECT ? AS program_id"
		inPlaceholders[i] = "?"
	}
	idsCSV := strings.Join(inPlaceholders, ",")

	query := `
		WITH ids(program_id) AS (` + strings.Join(idSelects, " UNION ALL ") + `),
		anchors AS (
			SELECT w.program_id AS program_id, w.program_day_id AS anchor_day_id,
			       w.id AS anchor_wid, w.started_at AS anchor_started_at
			FROM workouts w
			JOIN program_days pd ON pd.id = w.program_day_id
			WHERE w.user_id = ? AND pd.is_rest_day = 0 AND w.program_id IN (` + idsCSV + `)
			  AND NOT EXISTS (
				SELECT 1 FROM workouts w2
				JOIN program_days pd2 ON pd2.id = w2.program_day_id
				WHERE w2.user_id = w.user_id AND w2.program_id = w.program_id AND pd2.is_rest_day = 0
				  AND (w2.started_at > w.started_at OR (w2.started_at = w.started_at AND w2.id > w.id))
			  )
		)
		SELECT ids.program_id, a.anchor_day_id, a.anchor_wid, a.anchor_started_at,
			(SELECT COUNT(*) FROM workouts w
			 WHERE w.user_id = ? AND w.program_id = ids.program_id
			   AND w.program_day_id IS NULL AND w.program_day_dropped = 0
			   AND (a.anchor_started_at IS NULL
			        OR w.started_at > a.anchor_started_at
			        OR (w.started_at = a.anchor_started_at AND w.id > a.anchor_wid))
			) AS unlinked
		FROM ids
		LEFT JOIN anchors a ON a.program_id = ids.program_id`

	args := make([]any, 0, 2*len(ids)+2)
	for _, id := range ids {
		args = append(args, id)
	}
	args = append(args, uid)
	for _, id := range ids {
		args = append(args, id)
	}
	args = append(args, uid)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var pid int64
		var anchorDayID sql.NullInt64
		var anchorWID sql.NullInt64
		var anchorStarted sql.NullString
		var unlinked int
		if err := rows.Scan(&pid, &anchorDayID, &anchorWID, &anchorStarted, &unlinked); err != nil {
			return nil, err
		}
		idx := workoutIdx[pid]
		if !anchorDayID.Valid {
			result[pid] = idx[unlinked%len(idx)]
			continue
		}
		p := progByID[pid]
		found := false
		for pos, wi := range idx {
			if p.Days[wi].ID == anchorDayID.Int64 {
				result[pid] = idx[(pos+1+unlinked)%len(idx)]
				found = true
				break
			}
		}
		if !found {
			// Anchor day vanished between the query and here — fall through as if its
			// log were day-less too (mirrors currentDayIndex's own fallback).
			result[pid] = idx[(unlinked+1)%len(idx)]
		}
	}
	return result, rows.Err()
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
//
// Day rows are updated IN PLACE, matched to the request by day id (CreateProgramDayReq.ID)
// — never deleted + recreated wholesale. workouts.program_day_id references
// program_days ON DELETE SET NULL, so recreating every day on any edit (even a name
// typo) would scrub the day linkage off the program's entire workout history and
// reset the due-day tracker to Day 1 — the exact silent desync the linkage exists to
// prevent. Id matching (not position) keeps that linkage correct across reorders and
// mid-list removals too: position alone can't tell "renamed day 0" from "deleted
// day 0". Request content alone can't distinguish a legacy id-less payload from a
// modern client that deleted every existing day and added only new ones (zero ids
// either way), so modern clients also send DayIDsKnown to force id matching for
// that edit — the deleted days' history is dropped as residue instead of being
// positionally re-attributed to the brand-new days. Only requests with no ids AND
// no flag (clients predating the id round-trip) fall back to positional matching —
// their same-position edits keep working; only their structural edits carry the old
// positional mis-attribution.
//
// Only days actually absent from the request are deleted; their workouts' linkage is
// dropped AND marked program_day_dropped so the due-day tracker ignores those rows
// as residue instead of miscounting them as day-less logs (see currentDayIndex).
// A day edited into a rest day sheds its workouts' linkage the same way (NULL +
// dropped): a rest day can never be due, so keeping the link would make those
// workouts invisible to the tracker, and counting them as day-less advances would
// swing the due day by the parity of that day's logged history. Each day's
// exercises/sets are still replaced wholesale: nothing persists a reference to them
// (a logged set's program_set_id is request-only, never stored), so recreating them
// is safe — the delete cascades to program_sets via the program_exercise_id FK,
// same layered cascade the flat model relied on.
func (s *ProgramStore) Update(uid, id int64, req models.CreateProgramRequest) (models.Program, error) {
	if err := inTxDo(s.db, func(tx *sql.Tx) error {
		var ownedID int64
		if err := tx.QueryRow(`SELECT id FROM programs WHERE id = ? AND user_id = ?`, id, uid).Scan(&ownedID); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE programs SET name = ?, notes = ? WHERE id = ?`, req.Name, req.Notes, id); err != nil {
			return err
		}
		existing, err := dayIDsInOrder(tx, id)
		if err != nil {
			return err
		}
		hasIDs := req.DayIDsKnown
		for _, day := range req.Days {
			if day.ID != 0 {
				hasIDs = true
				break
			}
		}
		isExisting := make(map[int64]bool, len(existing))
		for _, dayID := range existing {
			isExisting[dayID] = true
		}
		kept := make(map[int64]bool, len(existing))
		for i, day := range req.Days {
			// Which existing row this request day is: by id when the client sends ids
			// (an id from some other program — or a duplicate — is treated as a new
			// day, so a crafted request can't touch rows outside this owned program),
			// by position for legacy id-less requests. 0 = a genuinely new day.
			var dayID int64
			if hasIDs {
				if day.ID != 0 && isExisting[day.ID] && !kept[day.ID] {
					dayID = day.ID
				}
			} else if i < len(existing) {
				dayID = existing[i]
			}
			if dayID == 0 {
				if err := insertProgramDay(tx, id, i, day); err != nil {
					return err
				}
				continue
			}
			kept[dayID] = true
			if _, err := tx.Exec(
				`UPDATE program_days SET order_index = ?, is_rest_day = ?, name = ? WHERE id = ?`,
				i, day.IsRestDay, day.Name, dayID,
			); err != nil {
				return err
			}
			if _, err := tx.Exec(`DELETE FROM program_exercises WHERE program_day_id = ?`, dayID); err != nil {
				return err
			}
			if day.IsRestDay {
				// Un-link workouts logged against this now-rest day (also lazily scrubs
				// any pre-existing rest-day linkage): rest days are excluded from the
				// tracker's anchor lookup, so a kept link would strand those workouts —
				// neither anchoring nor advancing. Marked dropped exactly like a deleted
				// day's rows: the day's cycle position is gone either way, and counting
				// the shed rows as day-less advances would swing the due day by the
				// parity of the day's whole logged history (see currentDayIndex).
				if err := dropDayLinkage(tx, dayID); err != nil {
					return err
				}
				continue // rest days never carry exercises, even if the client sent some
			}
			if err := insertProgramExercises(tx, id, dayID, day.Exercises); err != nil {
				return err
			}
		}
		for _, dayID := range existing {
			if kept[dayID] {
				continue
			}
			// Deliberately removed day: drop its workouts' linkage (per the ON DELETE
			// SET NULL contract) but mark them dropped — their cycle position is
			// unknowable, and counting them as day-less advances would swing the due
			// day by the parity of an arbitrary historical count (see currentDayIndex).
			if err := dropDayLinkage(tx, dayID); err != nil {
				return err
			}
			if _, err := tx.Exec(`DELETE FROM program_days WHERE id = ?`, dayID); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return models.Program{}, err
	}
	return s.get(id)
}

// dropDayLinkage severs workouts.program_day_id for a day that's being deleted or
// rest-toggled, marking them program_day_dropped so currentDayIndex's "unlinked rows
// advance the tracker" fallback skips them — their cycle position became unknowable
// the moment the day went away, so counting them would swing the due day by the
// parity of an arbitrary historical count (see currentDayIndex's own comment).
func dropDayLinkage(tx *sql.Tx, dayID int64) error {
	_, err := tx.Exec(`UPDATE workouts SET program_day_id = NULL, program_day_dropped = 1 WHERE program_day_id = ?`, dayID)
	return err
}

// dayIDsInOrder returns a program's existing day row ids in cycle order, within tx.
func dayIDsInOrder(tx *sql.Tx, programID int64) ([]int64, error) {
	rows, err := tx.Query(`SELECT id FROM program_days WHERE program_id = ? ORDER BY order_index`, programID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
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
		if err := insertProgramDay(tx, programID, i, day); err != nil {
			return err
		}
	}
	return nil
}

// insertProgramDay writes one Day at the given cycle position. orderIndex is the
// request array position (same convention as insertProgramExercises' `i`, not a
// client-echoed value) — a client resending a stale/duplicate order_index can't
// scramble the cycle order.
func insertProgramDay(tx *sql.Tx, programID int64, orderIndex int, day models.CreateProgramDayReq) error {
	dayRes, err := tx.Exec(
		`INSERT INTO program_days (program_id, order_index, is_rest_day, name) VALUES (?, ?, ?, ?)`,
		programID, orderIndex, day.IsRestDay, day.Name,
	)
	if err != nil {
		return err
	}
	dayID, err := dayRes.LastInsertId()
	if err != nil {
		return err
	}
	if day.IsRestDay {
		return nil // rest days never carry exercises, even if the client sent some
	}
	return insertProgramExercises(tx, programID, dayID, day.Exercises)
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

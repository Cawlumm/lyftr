package stores

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
)

// MaxCustomExercises caps one user's non-archived custom exercises.
const MaxCustomExercises = 500

var (
	// ErrExerciseNotFound covers a missing row and another user's custom row alike, so
	// the answer never says whether the id exists.
	ErrExerciseNotFound = errors.New("exercise not found")
	// ErrNotCustom means the row is a catalog exercise, which nobody edits.
	ErrNotCustom          = errors.New("not a custom exercise")
	ErrNameTaken          = errors.New("exercise name already used")
	ErrCustomLimit        = errors.New("custom exercise limit reached")
	ErrInvalidMergeTarget = errors.New("invalid merge target")
	// ErrExerciseNotVisible means an id names another user's custom exercise.
	ErrExerciseNotVisible = errors.New("exercise not visible")
)

// TaxonomyError names the request field whose value is not a known slug.
type TaxonomyError struct{ Field string }

func (e *TaxonomyError) Error() string { return e.Field + " is not a known value" }

// StepsFromText and StepsToText are the one parse and join of an instruction list and the
// numbered description kept beside it (see models/steps.go).
var (
	StepsFromText = models.StepsFromText
	StepsToText   = models.StepsToText
)

// NormalizeCustom trims and lowercases what a person typed, applies the defaults, and drops
// the primary muscle and duplicates from the secondary list. It is idempotent.
func NormalizeCustom(req models.CreateExerciseRequest) models.CreateExerciseRequest {
	req.Name = strings.TrimSpace(req.Name)
	req.MuscleGroup = strings.ToLower(strings.TrimSpace(req.MuscleGroup))
	req.Equipment = strings.ToLower(strings.TrimSpace(req.Equipment))
	req.Category = strings.ToLower(strings.TrimSpace(req.Category))
	if req.Instructions != nil {
		req.Instructions = models.CleanSteps(req.Instructions)
	} else {
		req.Instructions = models.StepsFromText(req.Description)
	}
	req.Description = models.StepsToText(req.Instructions)
	if req.Equipment == "" {
		req.Equipment = "body-only"
	}
	if req.Category == "" {
		req.Category = "strength"
	}
	secondary := []string{}
	seen := map[string]bool{req.MuscleGroup: true}
	for _, m := range req.SecondaryMuscles {
		m = strings.ToLower(strings.TrimSpace(m))
		if m == "" || seen[m] {
			continue
		}
		seen[m] = true
		secondary = append(secondary, m)
	}
	req.SecondaryMuscles = secondary
	return req
}

func checkTaxonomy(req models.CreateExerciseRequest) error {
	if !inList(CustomMuscles, req.MuscleGroup) {
		return &TaxonomyError{"muscle_group"}
	}
	if !inList(CustomEquipment, req.Equipment) {
		return &TaxonomyError{"equipment"}
	}
	if !inList(CustomCategories, req.Category) {
		return &TaxonomyError{"category"}
	}
	for _, m := range req.SecondaryMuscles {
		if !inList(CustomMuscles, m) {
			return &TaxonomyError{"secondary_muscles"}
		}
	}
	return nil
}

func newUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}

func (s *ExerciseStore) getTx(tx *sql.Tx, id int64) (models.Exercise, error) {
	var e models.Exercise
	sel, args := exerciseSelect(defaultLocale)
	err := scanExercise(tx.QueryRow(sel+` WHERE e.id = ?`, append(args, id)...), &e)
	return e, err
}

// VisibleTo reports ErrExerciseNotVisible when any id is another user's custom exercise.
// Ids that match no row are left to the foreign key, as before custom exercises. An
// archived exercise of the caller's stays visible: old workouts must remain editable.
func (s *ExerciseStore) VisibleTo(userID int64, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	raw, err := json.Marshal(ids)
	if err != nil {
		return err
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM exercises
		WHERE id IN (SELECT value FROM json_each(?)) AND owner_user_id IS NOT NULL AND owner_user_id != ?`,
		string(raw), userID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return ErrExerciseNotVisible
	}
	return nil
}

// MergedTargets maps each of the caller's ids that was merged away to the exercise its history
// now lives under, following chains (A into B, then B into C). A save from a workout begun
// before the merge, or queued offline, still names the source; writing it there would split
// the history the merge just joined.
func (s *ExerciseStore) MergedTargets(userID int64, ids []int64) (map[int64]int64, error) {
	out := map[int64]int64{}
	if len(ids) == 0 {
		return out, nil
	}
	raw, err := json.Marshal(ids)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`WITH RECURSIVE chain(start, id, depth) AS (
			SELECT id, merged_into_id, 1 FROM exercises
			WHERE id IN (SELECT value FROM json_each(?)) AND owner_user_id = ? AND merged_into_id IS NOT NULL
			UNION ALL
			SELECT chain.start, e.merged_into_id, chain.depth + 1 FROM chain
			JOIN exercises e ON e.id = chain.id AND e.owner_user_id = ? AND e.merged_into_id IS NOT NULL
			WHERE chain.depth < 20)
		SELECT start, id FROM chain c1 WHERE depth = (SELECT MAX(depth) FROM chain c2 WHERE c2.start = c1.start)`,
		string(raw), userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var from, to int64
		if err := rows.Scan(&from, &to); err != nil {
			return nil, err
		}
		out[from] = to
	}
	return out, rows.Err()
}

// owned loads the row a caller wants to change: ErrExerciseNotFound if it is missing or
// someone else's, ErrNotCustom if it belongs to the catalog.
func owned(tx *sql.Tx, userID, id int64) (archived bool, err error) {
	var owner sql.NullInt64
	var archivedAt sql.NullString
	err = tx.QueryRow(`SELECT owner_user_id, archived_at FROM exercises WHERE id = ?`, id).Scan(&owner, &archivedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return false, ErrExerciseNotFound
	}
	if err != nil {
		return false, err
	}
	if !owner.Valid {
		return false, ErrNotCustom
	}
	if owner.Int64 != userID {
		return false, ErrExerciseNotFound
	}
	return archivedAt.Valid, nil
}

func nameTaken(err error) error {
	if utils.IsUniqueViolation(err) {
		return ErrNameTaken
	}
	return err
}

func (s *ExerciseStore) CreateCustom(userID int64, req models.CreateExerciseRequest) (models.Exercise, error) {
	req = NormalizeCustom(req)
	if err := checkTaxonomy(req); err != nil {
		return models.Exercise{}, err
	}
	uuid, err := newUUID()
	if err != nil {
		return models.Exercise{}, err
	}
	secondary, err := json.Marshal(req.SecondaryMuscles)
	if err != nil {
		return models.Exercise{}, err
	}
	steps, err := json.Marshal(req.Instructions)
	if err != nil {
		return models.Exercise{}, err
	}
	return inTx(s.db, func(tx *sql.Tx) (models.Exercise, error) {
		var n int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM exercises WHERE owner_user_id = ? AND archived_at IS NULL`, userID).Scan(&n); err != nil {
			return models.Exercise{}, err
		}
		if n >= MaxCustomExercises {
			return models.Exercise{}, ErrCustomLimit
		}
		res, err := tx.Exec(`INSERT INTO exercises
			(name, muscle_group, secondary_muscles, category, equipment, description, instructions, owner_user_id, custom_uuid, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			req.Name, req.MuscleGroup, string(secondary), req.Category, req.Equipment, req.Description, string(steps), userID, uuid)
		if err != nil {
			return models.Exercise{}, nameTaken(err)
		}
		id, err := res.LastInsertId()
		if err != nil {
			return models.Exercise{}, err
		}
		return s.getTx(tx, id)
	})
}

func (s *ExerciseStore) UpdateCustom(userID, id int64, req models.CreateExerciseRequest) (models.Exercise, error) {
	req = NormalizeCustom(req)
	if err := checkTaxonomy(req); err != nil {
		return models.Exercise{}, err
	}
	secondary, err := json.Marshal(req.SecondaryMuscles)
	if err != nil {
		return models.Exercise{}, err
	}
	steps, err := json.Marshal(req.Instructions)
	if err != nil {
		return models.Exercise{}, err
	}
	return inTx(s.db, func(tx *sql.Tx) (models.Exercise, error) {
		if _, err := owned(tx, userID, id); err != nil {
			return models.Exercise{}, err
		}
		if _, err := tx.Exec(`UPDATE exercises SET name = ?, muscle_group = ?, secondary_muscles = ?,
			category = ?, equipment = ?, description = ?, instructions = ? WHERE id = ?`,
			req.Name, req.MuscleGroup, string(secondary), req.Category, req.Equipment, req.Description, string(steps), id); err != nil {
			return models.Exercise{}, nameTaken(err)
		}
		return s.getTx(tx, id)
	})
}

// Archive hides a custom exercise from pickers and lists; workouts keep pointing at it.
// Archiving an archived row changes nothing.
func (s *ExerciseStore) Archive(userID, id int64) (models.Exercise, error) {
	return inTx(s.db, func(tx *sql.Tx) (models.Exercise, error) {
		archived, err := owned(tx, userID, id)
		if err != nil {
			return models.Exercise{}, err
		}
		if !archived {
			if _, err := tx.Exec(`UPDATE exercises SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`, id); err != nil {
				return models.Exercise{}, err
			}
		}
		return s.getTx(tx, id)
	})
}

// Unarchive fails with ErrNameTaken if the owner has since made another active exercise of
// the same name (the owner-name index only covers active rows).
func (s *ExerciseStore) Unarchive(userID, id int64) (models.Exercise, error) {
	return inTx(s.db, func(tx *sql.Tx) (models.Exercise, error) {
		archived, err := owned(tx, userID, id)
		if err != nil {
			return models.Exercise{}, err
		}
		if archived {
			var n int
			if err := tx.QueryRow(`SELECT COUNT(*) FROM exercises WHERE owner_user_id = ? AND archived_at IS NULL`, userID).Scan(&n); err != nil {
				return models.Exercise{}, err
			}
			if n >= MaxCustomExercises {
				return models.Exercise{}, ErrCustomLimit
			}
			if _, err := tx.Exec(`UPDATE exercises SET archived_at = NULL, merged_into_id = NULL WHERE id = ?`, id); err != nil {
				return models.Exercise{}, nameTaken(err)
			}
		}
		return s.getTx(tx, id)
	})
}

// Usage counts the caller's own workouts and program days that use the exercise, and with a
// merge target (into > 0) the program days that list both.
func (s *ExerciseStore) Usage(userID, id, into int64) (models.ExerciseUsage, error) {
	var u models.ExerciseUsage
	var visible bool
	err := s.db.QueryRow(`SELECT EXISTS (SELECT 1 FROM exercises WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?))`,
		id, userID).Scan(&visible)
	if err != nil {
		return u, err
	}
	if !visible {
		return u, ErrExerciseNotFound
	}
	err = s.db.QueryRow(`SELECT
		(SELECT COUNT(DISTINCT we.workout_id) FROM workout_exercises we
			JOIN workouts w ON w.id = we.workout_id WHERE we.exercise_id = ? AND w.user_id = ?),
		(SELECT COUNT(DISTINCT pe.program_day_id) FROM program_exercises pe
			JOIN programs p ON p.id = pe.program_id WHERE pe.exercise_id = ? AND p.user_id = ?)`,
		id, userID, id, userID).Scan(&u.Workouts, &u.ProgramDays)
	if err != nil || into <= 0 {
		return u, err
	}
	err = s.db.QueryRow(`SELECT COUNT(*) FROM (
		SELECT pe.program_day_id FROM program_exercises pe JOIN programs p ON p.id = pe.program_id
		WHERE p.user_id = ? AND pe.exercise_id IN (?, ?)
		GROUP BY pe.program_day_id HAVING COUNT(DISTINCT pe.exercise_id) = 2)`, userID, id, into).Scan(&u.SharedProgramDays)
	return u, err
}

// Merge re-points the caller's workout and program rows from one custom exercise to another
// exercise they can see, then archives the source. The source row stays so nothing dangles.
func (s *ExerciseStore) Merge(userID, fromID, intoID int64) (models.MergeResult, error) {
	return inTx(s.db, func(tx *sql.Tx) (models.MergeResult, error) {
		var out models.MergeResult
		if _, err := owned(tx, userID, fromID); err != nil {
			return out, err
		}
		if fromID == intoID {
			return out, ErrInvalidMergeTarget
		}
		var owner sql.NullInt64
		var archivedAt sql.NullString
		err := tx.QueryRow(`SELECT owner_user_id, archived_at FROM exercises WHERE id = ?`, intoID).Scan(&owner, &archivedAt)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && (archivedAt.Valid || (owner.Valid && owner.Int64 != userID))) {
			return out, ErrInvalidMergeTarget
		}
		if err != nil {
			return out, err
		}
		if err := tx.QueryRow(`SELECT
			(SELECT COUNT(DISTINCT workout_id) FROM workout_exercises
				WHERE exercise_id = ? AND workout_id IN (SELECT id FROM workouts WHERE user_id = ?)),
			(SELECT COUNT(DISTINCT program_day_id) FROM program_exercises
				WHERE exercise_id = ? AND program_id IN (SELECT id FROM programs WHERE user_id = ?))`,
			fromID, userID, fromID, userID).Scan(&out.MovedWorkouts, &out.MovedProgramDays); err != nil {
			return out, err
		}
		if _, err := tx.Exec(`UPDATE workout_exercises SET exercise_id = ?
			WHERE exercise_id = ? AND workout_id IN (SELECT id FROM workouts WHERE user_id = ?)`, intoID, fromID, userID); err != nil {
			return out, err
		}
		if _, err := tx.Exec(`UPDATE program_exercises SET exercise_id = ?
			WHERE exercise_id = ? AND program_id IN (SELECT id FROM programs WHERE user_id = ?)`, intoID, fromID, userID); err != nil {
			return out, err
		}
		if out.CombinedProgramDays, err = combineDuplicateBlocks(tx, userID, intoID); err != nil {
			return out, err
		}
		if _, err := tx.Exec(`UPDATE exercises SET archived_at = CURRENT_TIMESTAMP, merged_into_id = ? WHERE id = ?`, intoID, fromID); err != nil {
			return out, err
		}
		out.Into, err = s.getTx(tx, intoID)
		return out, err
	})
}

// combineDuplicateBlocks folds a program day that, after a merge, lists the exercise more than
// once into a single block: the first one (by order) keeps its place, settings and superset, and
// takes the others' sets after its own; the others go. Without it every workout started from that
// day would open with the same exercise twice. Logged workouts are left alone on purpose: two
// blocks there are an honest record of what was done, and history already counts per session.
// It returns how many days were combined.
func combineDuplicateBlocks(tx *sql.Tx, userID, exerciseID int64) (int, error) {
	rows, err := tx.Query(`SELECT pe.program_day_id, pe.id, pe.notes FROM program_exercises pe
		JOIN programs p ON p.id = pe.program_id
		WHERE pe.exercise_id = ? AND p.user_id = ? AND pe.program_day_id IN (
			SELECT program_day_id FROM program_exercises WHERE exercise_id = ?
			GROUP BY program_day_id HAVING COUNT(*) > 1)
		ORDER BY pe.program_day_id, pe.order_index, pe.id`, exerciseID, userID, exerciseID)
	if err != nil {
		return 0, err
	}
	type block struct {
		day, id int64
		notes   string
	}
	var blocks []block
	for rows.Next() {
		var b block
		if err := rows.Scan(&b.day, &b.id, &b.notes); err != nil {
			rows.Close()
			return 0, err
		}
		blocks = append(blocks, b)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	days := 0
	for i := 0; i < len(blocks); {
		keep := blocks[i]
		j := i + 1
		for ; j < len(blocks) && blocks[j].day == keep.day; j++ {
			drop := blocks[j]
			// Read the offset first: a subquery in the UPDATE would see the rows it has already moved.
			var last int
			if err := tx.QueryRow(`SELECT COALESCE(MAX(set_number), 0) FROM program_sets WHERE program_exercise_id = ?`, keep.id).Scan(&last); err != nil {
				return 0, err
			}
			if _, err := tx.Exec(`UPDATE program_sets SET program_exercise_id = ?, set_number = set_number + ?
				WHERE program_exercise_id = ?`, keep.id, last, drop.id); err != nil {
				return 0, err
			}
			if keep.notes == "" && drop.notes != "" {
				keep.notes = drop.notes
				if _, err := tx.Exec(`UPDATE program_exercises SET notes = ? WHERE id = ?`, keep.notes, keep.id); err != nil {
					return 0, err
				}
			}
			if _, err := tx.Exec(`DELETE FROM program_exercises WHERE id = ?`, drop.id); err != nil {
				return 0, err
			}
		}
		// A superset the dropped block belonged to may now have one member left: that is no superset.
		if _, err := tx.Exec(`UPDATE program_exercises SET superset_group = NULL
			WHERE program_day_id = ? AND superset_group IS NOT NULL AND superset_group IN (
				SELECT superset_group FROM program_exercises WHERE program_day_id = ? AND superset_group IS NOT NULL
				GROUP BY superset_group HAVING COUNT(*) = 1)`, keep.day, keep.day); err != nil {
			return 0, err
		}
		// Close the gap the dropped blocks left in the day's order.
		if _, err := tx.Exec(`UPDATE program_exercises SET order_index = (
				SELECT COUNT(*) FROM program_exercises o WHERE o.program_day_id = program_exercises.program_day_id
				AND (o.order_index < program_exercises.order_index OR (o.order_index = program_exercises.order_index AND o.id < program_exercises.id)))
			WHERE program_day_id = ?`, keep.day); err != nil {
			return 0, err
		}
		days++
		i = j
	}
	return days, nil
}

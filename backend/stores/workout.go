package stores

import (
	"database/sql"
	"strings"

	"github.com/Cawlumm/lyftr-backend/models"
)

// WorkoutStore owns all SQL for workouts, workout_exercises and sets, plus the
// workout-derived exercise analytics (PRs/history/daily count).
type WorkoutStore struct{ db *sql.DB }

func NewWorkoutStore(db *sql.DB) *WorkoutStore { return &WorkoutStore{db: db} }

// WorkoutFilter holds list paging + optional name search.
type WorkoutFilter struct {
	Limit, Offset int
	Query         string
}

const workoutCols = `id, user_id, name, notes, duration, started_at, created_at`

func scanWorkout(row interface{ Scan(...any) error }, w *models.Workout) error {
	return row.Scan(&w.ID, &w.UserID, &w.Name, &w.Notes, &w.Duration, &w.StartedAt, &w.CreatedAt)
}

func (s *WorkoutStore) List(uid int64, f WorkoutFilter) ([]models.Workout, error) {
	var rows *sql.Rows
	var err error
	if f.Query != "" {
		rows, err = s.db.Query(
			`SELECT `+workoutCols+` FROM workouts WHERE user_id = ? AND LOWER(name) LIKE ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
			uid, "%"+strings.ToLower(f.Query)+"%", f.Limit, f.Offset,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT `+workoutCols+` FROM workouts WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
			uid, f.Limit, f.Offset,
		)
	}
	if err != nil {
		return nil, err
	}
	workouts := []models.Workout{}
	for rows.Next() {
		var w models.Workout
		if err := scanWorkout(rows, &w); err != nil {
			rows.Close()
			return nil, err
		}
		workouts = append(workouts, w)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close() // close the parent cursor BEFORE loading children (#36: avoid holding 2 pool connections per request)

	for i := range workouts {
		ex, err := s.loadExercises(workouts[i].ID)
		if err != nil {
			return nil, err
		}
		workouts[i].Exercises = ex
	}
	return workouts, nil
}

// Get returns a user-owned workout with its exercises/sets, or sql.ErrNoRows.
func (s *WorkoutStore) Get(uid, id int64) (models.Workout, error) {
	var w models.Workout
	if err := scanWorkout(
		s.db.QueryRow(`SELECT `+workoutCols+` FROM workouts WHERE id = ? AND user_id = ?`, id, uid), &w,
	); err != nil {
		return models.Workout{}, err
	}
	ex, err := s.loadExercises(id)
	if err != nil {
		return models.Workout{}, err
	}
	w.Exercises = ex
	return w, nil
}

// get re-reads by id (no user scope) — used after a user-scoped write.
func (s *WorkoutStore) get(id int64) (models.Workout, error) {
	var w models.Workout
	if err := scanWorkout(s.db.QueryRow(`SELECT `+workoutCols+` FROM workouts WHERE id = ?`, id), &w); err != nil {
		return models.Workout{}, err
	}
	ex, err := s.loadExercises(id)
	if err != nil {
		return models.Workout{}, err
	}
	w.Exercises = ex
	return w, nil
}

func (s *WorkoutStore) Create(uid int64, req models.CreateWorkoutRequest) (models.Workout, error) {
	wid, err := inTx(s.db, func(tx *sql.Tx) (int64, error) {
		res, err := tx.Exec(
			`INSERT INTO workouts (user_id, name, notes, duration, started_at) VALUES (?, ?, ?, ?, ?)`,
			uid, req.Name, req.Notes, req.Duration, req.StartedAt,
		)
		if err != nil {
			return 0, err
		}
		wid, err := res.LastInsertId()
		if err != nil {
			return 0, err
		}
		if err := insertWorkoutExercises(tx, wid, req.Exercises); err != nil {
			return 0, err
		}
		return wid, nil
	})
	if err != nil {
		return models.Workout{}, err
	}
	return s.get(wid)
}

// Update replaces a user-owned workout and its children in one tx. sql.ErrNoRows
// if the workout isn't theirs (nothing is mutated).
func (s *WorkoutStore) Update(uid, id int64, req models.CreateWorkoutRequest) (models.Workout, error) {
	// Ownership check + replace-children, all in one transaction (no TOCTOU).
	if err := inTxDo(s.db, func(tx *sql.Tx) error {
		var ownedID int64
		if err := tx.QueryRow(`SELECT id FROM workouts WHERE id = ? AND user_id = ?`, id, uid).Scan(&ownedID); err != nil {
			return err // ErrNoRows = not theirs
		}
		if _, err := tx.Exec(
			`UPDATE workouts SET name = ?, notes = ?, duration = ?, started_at = ? WHERE id = ?`,
			req.Name, req.Notes, req.Duration, req.StartedAt, id,
		); err != nil {
			return err
		}
		// Children replaced wholesale; sets cascade-delete with their workout_exercise.
		if _, err := tx.Exec(`DELETE FROM workout_exercises WHERE workout_id = ?`, id); err != nil {
			return err
		}
		return insertWorkoutExercises(tx, id, req.Exercises)
	}); err != nil {
		return models.Workout{}, err
	}
	return s.get(id)
}

func (s *WorkoutStore) Delete(uid, id int64) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM workouts WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// insertWorkoutExercises writes the exercises + their sets for a workout within tx.
func insertWorkoutExercises(tx *sql.Tx, wid int64, exercises []models.CreateWorkoutExerciseReq) error {
	for i, ex := range exercises {
		exRes, err := tx.Exec(
			`INSERT INTO workout_exercises (workout_id, exercise_id, order_index, notes) VALUES (?, ?, ?, ?)`,
			wid, ex.ExerciseID, i, ex.Notes,
		)
		if err != nil {
			return err
		}
		weid, err := exRes.LastInsertId()
		if err != nil {
			return err
		}
		for j, st := range ex.Sets {
			if _, err := tx.Exec(
				`INSERT INTO sets (workout_exercise_id, set_number, reps, weight, duration, distance, rpe, is_warmup)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				weid, j+1, st.Reps, st.Weight, st.Duration, st.Distance, st.RPE, st.IsWarmup,
			); err != nil {
				return err
			}
		}
	}
	return nil
}

// loadExercises loads a workout's exercises (JOIN exercises for display) then
// their sets. Scans + closes the parent cursor fully BEFORE the per-exercise set
// queries (#36) so a request never holds two pool connections at once.
func (s *WorkoutStore) loadExercises(workoutID int64) ([]models.WorkoutExercise, error) {
	rows, err := s.db.Query(
		`SELECT we.id, we.workout_id, we.exercise_id, we.order_index, we.notes,
		        e.name, e.muscle_group, e.category, e.equipment, e.image_url
		 FROM workout_exercises we
		 JOIN exercises e ON e.id = we.exercise_id
		 WHERE we.workout_id = ? ORDER BY we.order_index`,
		workoutID,
	)
	if err != nil {
		return nil, err
	}
	var exercises []models.WorkoutExercise
	for rows.Next() {
		var we models.WorkoutExercise
		if err := rows.Scan(
			&we.ID, &we.WorkoutID, &we.ExerciseID, &we.OrderIndex, &we.Notes,
			&we.Exercise.Name, &we.Exercise.MuscleGroup, &we.Exercise.Category,
			&we.Exercise.Equipment, &we.Exercise.ImageURL,
		); err != nil {
			rows.Close()
			return nil, err
		}
		we.Exercise.ID = we.ExerciseID
		exercises = append(exercises, we)
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

func (s *WorkoutStore) loadSets(workoutExerciseID int64) ([]models.Set, error) {
	rows, err := s.db.Query(
		`SELECT id, workout_exercise_id, set_number, reps, weight, duration, distance, rpe, is_warmup
		 FROM sets WHERE workout_exercise_id = ? ORDER BY set_number`,
		workoutExerciseID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sets []models.Set
	for rows.Next() {
		var st models.Set
		if err := rows.Scan(&st.ID, &st.WorkoutExerciseID, &st.SetNumber, &st.Reps, &st.Weight, &st.Duration, &st.Distance, &st.RPE, &st.IsWarmup); err != nil {
			return nil, err
		}
		sets = append(sets, st)
	}
	return sets, rows.Err()
}

// CountOn returns how many workouts the user started on the given calendar day
// (YYYY-MM-DD). Used by the food daily-stats view (cross-entity composition).
func (s *WorkoutStore) CountOn(uid int64, date string) (int, error) {
	var n int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM workouts WHERE user_id = ? AND substr(started_at, 1, 10) = ?`,
		uid, date,
	).Scan(&n)
	return n, err
}

// ExercisePR is the best single set for an exercise (heaviest, then most reps).
type ExercisePR struct {
	Weight    float64
	Reps      int
	Date      string
	WorkoutID int64
}

// ExerciseHistoryPoint is a per-workout rollup for an exercise's progress chart.
type ExerciseHistoryPoint struct {
	Date        string  `json:"date"`
	MaxWeight   float64 `json:"max_weight"`
	TotalVolume float64 `json:"total_volume"`
	SetsCount   int     `json:"sets_count"`
}

// PRForExercise returns the user's PR set for an exercise, or sql.ErrNoRows if
// they have no qualifying (non-warmup, weighted) set. Reads workout tables — this
// is workout-derived analytics keyed by exercise, so it lives on WorkoutStore.
func (s *WorkoutStore) PRForExercise(uid, exerciseID int64) (ExercisePR, error) {
	var pr ExercisePR
	err := s.db.QueryRow(`
		SELECT s.weight, s.reps, w.started_at, w.id
		FROM sets s
		JOIN workout_exercises we ON we.id = s.workout_exercise_id
		JOIN workouts w ON w.id = we.workout_id
		WHERE w.user_id = ? AND we.exercise_id = ? AND s.is_warmup = 0 AND s.weight > 0
		ORDER BY s.weight DESC, s.reps DESC
		LIMIT 1
	`, uid, exerciseID).Scan(&pr.Weight, &pr.Reps, &pr.Date, &pr.WorkoutID)
	return pr, err
}

func (s *WorkoutStore) HistoryForExercise(uid, exerciseID int64, limit int) ([]ExerciseHistoryPoint, error) {
	rows, err := s.db.Query(`
		SELECT w.started_at, MAX(s.weight), SUM(s.reps * s.weight), COUNT(s.id)
		FROM sets s
		JOIN workout_exercises we ON we.id = s.workout_exercise_id
		JOIN workouts w ON w.id = we.workout_id
		WHERE w.user_id = ? AND we.exercise_id = ? AND s.is_warmup = 0
		GROUP BY w.id
		ORDER BY w.started_at DESC
		LIMIT ?
	`, uid, exerciseID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	history := []ExerciseHistoryPoint{}
	for rows.Next() {
		var p ExerciseHistoryPoint
		if err := rows.Scan(&p.Date, &p.MaxWeight, &p.TotalVolume, &p.SetsCount); err != nil {
			return nil, err
		}
		history = append(history, p)
	}
	return history, rows.Err()
}

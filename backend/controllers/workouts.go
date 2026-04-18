package controllers

import (
	"database/sql"
	"strconv"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func ListWorkouts(c *gin.Context) {
	uid := middleware.UserID(c)
	limit := 20
	offset := 0
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(c.Query("offset")); err == nil && o >= 0 {
		offset = o
	}

	rows, err := db.DB.Query(
		`SELECT id, user_id, name, notes, duration, started_at, created_at
		 FROM workouts WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
		uid, limit, offset,
	)
	if err != nil {
		utils.InternalError(c)
		return
	}
	defer rows.Close()

	workouts := []models.Workout{}
	for rows.Next() {
		var w models.Workout
		rows.Scan(&w.ID, &w.UserID, &w.Name, &w.Notes, &w.Duration, &w.StartedAt, &w.CreatedAt)
		workouts = append(workouts, w)
	}
	utils.OK(c, workouts)
}

func GetWorkout(c *gin.Context) {
	uid := middleware.UserID(c)
	wid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid workout id")
		return
	}

	var w models.Workout
	err = db.DB.QueryRow(
		`SELECT id, user_id, name, notes, duration, started_at, created_at
		 FROM workouts WHERE id = ? AND user_id = ?`, wid, uid,
	).Scan(&w.ID, &w.UserID, &w.Name, &w.Notes, &w.Duration, &w.StartedAt, &w.CreatedAt)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "workout not found")
		return
	}
	if err != nil {
		utils.InternalError(c)
		return
	}

	w.Exercises = loadWorkoutExercises(wid)
	utils.OK(c, w)
}

func CreateWorkout(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.CreateWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	if req.StartedAt.IsZero() {
		req.StartedAt = time.Now()
	}

	res, err := db.DB.Exec(
		`INSERT INTO workouts (user_id, name, notes, duration, started_at) VALUES (?, ?, ?, ?, ?)`,
		uid, req.Name, req.Notes, req.Duration, req.StartedAt,
	)
	if err != nil {
		utils.InternalError(c)
		return
	}
	wid, _ := res.LastInsertId()

	for i, ex := range req.Exercises {
		exRes, err := db.DB.Exec(
			`INSERT INTO workout_exercises (workout_id, exercise_id, order_index, notes) VALUES (?, ?, ?, ?)`,
			wid, ex.ExerciseID, i, ex.Notes,
		)
		if err != nil {
			continue
		}
		weid, _ := exRes.LastInsertId()
		for j, s := range ex.Sets {
			db.DB.Exec(
				`INSERT INTO sets (workout_exercise_id, set_number, reps, weight, duration, distance, rpe, is_warmup)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				weid, j+1, s.Reps, s.Weight, s.Duration, s.Distance, s.RPE, s.IsWarmup,
			)
		}
	}

	var w models.Workout
	db.DB.QueryRow(
		`SELECT id, user_id, name, notes, duration, started_at, created_at FROM workouts WHERE id = ?`, wid,
	).Scan(&w.ID, &w.UserID, &w.Name, &w.Notes, &w.Duration, &w.StartedAt, &w.CreatedAt)
	w.Exercises = loadWorkoutExercises(wid)
	utils.Created(c, w)
}

func DeleteWorkout(c *gin.Context) {
	uid := middleware.UserID(c)
	wid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid workout id")
		return
	}

	res, err := db.DB.Exec(`DELETE FROM workouts WHERE id = ? AND user_id = ?`, wid, uid)
	if err != nil {
		utils.InternalError(c)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		utils.NotFound(c, "workout not found")
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

func loadWorkoutExercises(workoutID int64) []models.WorkoutExercise {
	rows, err := db.DB.Query(
		`SELECT we.id, we.workout_id, we.exercise_id, we.order_index, we.notes,
		        e.name, e.muscle_group, e.category, e.equipment, e.image_url
		 FROM workout_exercises we
		 JOIN exercises e ON e.id = we.exercise_id
		 WHERE we.workout_id = ? ORDER BY we.order_index`,
		workoutID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var exercises []models.WorkoutExercise
	for rows.Next() {
		var we models.WorkoutExercise
		rows.Scan(
			&we.ID, &we.WorkoutID, &we.ExerciseID, &we.OrderIndex, &we.Notes,
			&we.Exercise.Name, &we.Exercise.MuscleGroup, &we.Exercise.Category,
			&we.Exercise.Equipment, &we.Exercise.ImageURL,
		)
		we.Exercise.ID = we.ExerciseID
		we.Sets = loadSets(we.ID)
		exercises = append(exercises, we)
	}
	return exercises
}

func loadSets(workoutExerciseID int64) []models.Set {
	rows, err := db.DB.Query(
		`SELECT id, workout_exercise_id, set_number, reps, weight, duration, distance, rpe, is_warmup
		 FROM sets WHERE workout_exercise_id = ? ORDER BY set_number`,
		workoutExerciseID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var sets []models.Set
	for rows.Next() {
		var s models.Set
		rows.Scan(&s.ID, &s.WorkoutExerciseID, &s.SetNumber, &s.Reps, &s.Weight, &s.Duration, &s.Distance, &s.RPE, &s.IsWarmup)
		sets = append(sets, s)
	}
	return sets
}

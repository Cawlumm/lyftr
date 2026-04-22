package controllers

import (
	"encoding/json"
	"strconv"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/seed"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func ListExercises(c *gin.Context) {
	query := `SELECT id, name, muscle_group, secondary_muscles, category, equipment, description, image_url
	          FROM exercises WHERE 1=1`
	args := []any{}

	if q := c.Query("q"); q != "" {
		query += " AND name LIKE ?"
		args = append(args, "%"+q+"%")
	}
	if mg := c.Query("muscle_group"); mg != "" {
		query += " AND muscle_group = ?"
		args = append(args, mg)
	}
	if cat := c.Query("category"); cat != "" {
		query += " AND category = ?"
		args = append(args, cat)
	}
	if eq := c.Query("equipment"); eq != "" {
		query += " AND equipment = ?"
		args = append(args, eq)
	}

	limit := 100
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 2000 {
		limit = l
	}
	query += " ORDER BY name LIMIT ?"
	args = append(args, limit)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		utils.InternalError(c)
		return
	}
	defer rows.Close()

	exercises := []models.Exercise{}
	for rows.Next() {
		e := scanExercise(rows)
		exercises = append(exercises, e)
	}
	utils.OK(c, exercises)
}

func GetExercise(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid exercise id")
		return
	}

	row := db.DB.QueryRow(
		`SELECT id, name, muscle_group, secondary_muscles, category, equipment, description, image_url
		 FROM exercises WHERE id = ?`, id,
	)
	e := scanExercise(row)
	if e.ID == 0 {
		utils.NotFound(c, "exercise not found")
		return
	}
	utils.OK(c, e)
}

func GetExercisePRs(c *gin.Context) {
	userID := c.GetInt64("user_id")
	exerciseID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid exercise id")
		return
	}

	row := db.DB.QueryRow(`
		SELECT s.weight, s.reps, w.started_at, w.id
		FROM sets s
		JOIN workout_exercises we ON we.id = s.workout_exercise_id
		JOIN workouts w ON w.id = we.workout_id
		WHERE w.user_id = ? AND we.exercise_id = ? AND s.is_warmup = 0 AND s.weight > 0
		ORDER BY s.weight DESC, s.reps DESC
		LIMIT 1
	`, userID, exerciseID)

	var weight float64
	var reps int
	var date string
	var workoutID int64
	if err := row.Scan(&weight, &reps, &date, &workoutID); err != nil {
		utils.OK(c, nil)
		return
	}

	estimated1RM := weight * (1 + float64(reps)/30.0)
	utils.OK(c, gin.H{
		"weight":        weight,
		"reps":          reps,
		"estimated_1rm": estimated1RM,
		"date":          date,
		"workout_id":    workoutID,
	})
}

func GetExerciseHistory(c *gin.Context) {
	userID := c.GetInt64("user_id")
	exerciseID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid exercise id")
		return
	}

	limit := 20
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	rows, err := db.DB.Query(`
		SELECT w.started_at, MAX(s.weight), SUM(s.reps * s.weight), COUNT(s.id)
		FROM sets s
		JOIN workout_exercises we ON we.id = s.workout_exercise_id
		JOIN workouts w ON w.id = we.workout_id
		WHERE w.user_id = ? AND we.exercise_id = ? AND s.is_warmup = 0
		GROUP BY w.id
		ORDER BY w.started_at DESC
		LIMIT ?
	`, userID, exerciseID, limit)
	if err != nil {
		utils.InternalError(c)
		return
	}
	defer rows.Close()

	type point struct {
		Date        string  `json:"date"`
		MaxWeight   float64 `json:"max_weight"`
		TotalVolume float64 `json:"total_volume"`
		SetsCount   int     `json:"sets_count"`
	}
	history := []point{}
	for rows.Next() {
		var p point
		rows.Scan(&p.Date, &p.MaxWeight, &p.TotalVolume, &p.SetsCount)
		history = append(history, p)
	}
	utils.OK(c, history)
}

// SyncExercises is an admin-only endpoint to re-pull from ExerciseDB.
func SyncExercises(c *gin.Context) {
	if err := seed.SyncExercises(db.DB); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	var count int
	db.DB.QueryRow(`SELECT COUNT(*) FROM exercises`).Scan(&count)
	utils.OK(c, gin.H{"synced": true, "total": count})
}

// ExerciseSeedStatus returns exercise count and whether seeding is running.
func ExerciseSeedStatus(c *gin.Context) {
	utils.OK(c, seed.GetSeedStatus(db.DB))
}

// ResetExercises wipes the exercises table and triggers a fresh seed in background.
func ResetExercises(c *gin.Context) {
	if err := seed.WipeAndReseed(db.DB); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	utils.OK(c, gin.H{"reset": true, "message": "exercises wiped, re-seeding in background"})
}

type scanner interface {
	Scan(dest ...any) error
}

func scanExercise(row scanner) models.Exercise {
	var e models.Exercise
	var secondaryRaw string
	row.Scan(&e.ID, &e.Name, &e.MuscleGroup, &secondaryRaw, &e.Category, &e.Equipment, &e.Description, &e.ImageURL)
	json.Unmarshal([]byte(secondaryRaw), &e.SecondaryMuscles)
	if e.SecondaryMuscles == nil {
		e.SecondaryMuscles = []string{}
	}
	return e
}

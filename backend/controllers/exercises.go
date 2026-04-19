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

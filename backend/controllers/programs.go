package controllers

import (
	"database/sql"
	"strconv"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
	"github.com/gin-gonic/gin"
)

func ListPrograms(c *gin.Context) {
	uid := middleware.UserID(c)

	rows, err := db.DB.Query(
		`SELECT id, user_id, name, notes, created_at FROM programs WHERE user_id = ? ORDER BY created_at DESC`,
		uid,
	)
	if err != nil {
		utils.InternalError(c)
		return
	}
	defer rows.Close()

	programs := []models.Program{}
	for rows.Next() {
		var p models.Program
		rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Notes, &p.CreatedAt)
		p.Exercises = loadProgramExercises(p.ID)
		programs = append(programs, p)
	}
	utils.OK(c, programs)
}

func GetProgram(c *gin.Context) {
	uid := middleware.UserID(c)
	pid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid program id")
		return
	}

	var p models.Program
	err = db.DB.QueryRow(
		`SELECT id, user_id, name, notes, created_at FROM programs WHERE id = ? AND user_id = ?`, pid, uid,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Notes, &p.CreatedAt)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "program not found")
		return
	}
	if err != nil {
		utils.InternalError(c)
		return
	}

	p.Exercises = loadProgramExercises(pid)
	utils.OK(c, p)
}

func CreateProgram(c *gin.Context) {
	uid := middleware.UserID(c)
	var req models.CreateProgramRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	tx, err := db.DB.Begin()
	if err != nil {
		utils.InternalError(c)
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(
		`INSERT INTO programs (user_id, name, notes) VALUES (?, ?, ?)`,
		uid, req.Name, req.Notes,
	)
	if err != nil {
		utils.InternalError(c)
		return
	}
	pid, err := res.LastInsertId()
	if err != nil {
		utils.InternalError(c)
		return
	}

	for i, ex := range req.Exercises {
		exRes, err := tx.Exec(
			`INSERT INTO program_exercises (program_id, exercise_id, order_index, notes) VALUES (?, ?, ?, ?)`,
			pid, ex.ExerciseID, i, ex.Notes,
		)
		if err != nil {
			utils.InternalError(c)
			return
		}
		peid, err := exRes.LastInsertId()
		if err != nil {
			utils.InternalError(c)
			return
		}
		for j, s := range ex.Sets {
			sn := s.SetNumber
			if sn == 0 {
				sn = j + 1
			}
			_, err := tx.Exec(
				`INSERT INTO program_sets (program_exercise_id, set_number, target_reps, target_weight) VALUES (?, ?, ?, ?)`,
				peid, sn, s.TargetReps, s.TargetWeight,
			)
			if err != nil {
				utils.InternalError(c)
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		utils.InternalError(c)
		return
	}

	var p models.Program
	db.DB.QueryRow(
		`SELECT id, user_id, name, notes, created_at FROM programs WHERE id = ?`, pid,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Notes, &p.CreatedAt)
	p.Exercises = loadProgramExercises(pid)
	utils.Created(c, p)
}

func UpdateProgram(c *gin.Context) {
	uid := middleware.UserID(c)
	pid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid program id")
		return
	}

	var req models.CreateProgramRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		utils.ValidationError(c, err)
		return
	}

	var existing models.Program
	err = db.DB.QueryRow(
		`SELECT id FROM programs WHERE id = ? AND user_id = ?`, pid, uid,
	).Scan(&existing.ID)
	if err == sql.ErrNoRows {
		utils.NotFound(c, "program not found")
		return
	}
	if err != nil {
		utils.InternalError(c)
		return
	}

	tx, err := db.DB.Begin()
	if err != nil {
		utils.InternalError(c)
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`UPDATE programs SET name = ?, notes = ? WHERE id = ?`, req.Name, req.Notes, pid)
	if err != nil {
		utils.InternalError(c)
		return
	}

	_, err = tx.Exec(`DELETE FROM program_exercises WHERE program_id = ?`, pid)
	if err != nil {
		utils.InternalError(c)
		return
	}

	for i, ex := range req.Exercises {
		exRes, err := tx.Exec(
			`INSERT INTO program_exercises (program_id, exercise_id, order_index, notes) VALUES (?, ?, ?, ?)`,
			pid, ex.ExerciseID, i, ex.Notes,
		)
		if err != nil {
			utils.InternalError(c)
			return
		}
		peid, err := exRes.LastInsertId()
		if err != nil {
			utils.InternalError(c)
			return
		}
		for j, s := range ex.Sets {
			sn := s.SetNumber
			if sn == 0 {
				sn = j + 1
			}
			_, err := tx.Exec(
				`INSERT INTO program_sets (program_exercise_id, set_number, target_reps, target_weight) VALUES (?, ?, ?, ?)`,
				peid, sn, s.TargetReps, s.TargetWeight,
			)
			if err != nil {
				utils.InternalError(c)
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		utils.InternalError(c)
		return
	}

	var p models.Program
	db.DB.QueryRow(
		`SELECT id, user_id, name, notes, created_at FROM programs WHERE id = ?`, pid,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Notes, &p.CreatedAt)
	p.Exercises = loadProgramExercises(pid)
	utils.OK(c, p)
}

func DeleteProgram(c *gin.Context) {
	uid := middleware.UserID(c)
	pid, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid program id")
		return
	}

	res, err := db.DB.Exec(`DELETE FROM programs WHERE id = ? AND user_id = ?`, pid, uid)
	if err != nil {
		utils.InternalError(c)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		utils.NotFound(c, "program not found")
		return
	}
	utils.OK(c, gin.H{"deleted": true})
}

func loadProgramExercises(programID int64) []models.ProgramExercise {
	rows, err := db.DB.Query(
		`SELECT pe.id, pe.program_id, pe.exercise_id, pe.order_index, pe.notes,
		        e.name, e.muscle_group, e.category, e.equipment, e.image_url
		 FROM program_exercises pe
		 JOIN exercises e ON e.id = pe.exercise_id
		 WHERE pe.program_id = ? ORDER BY pe.order_index`,
		programID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var exercises []models.ProgramExercise
	for rows.Next() {
		var pe models.ProgramExercise
		rows.Scan(
			&pe.ID, &pe.ProgramID, &pe.ExerciseID, &pe.OrderIndex, &pe.Notes,
			&pe.Exercise.Name, &pe.Exercise.MuscleGroup, &pe.Exercise.Category,
			&pe.Exercise.Equipment, &pe.Exercise.ImageURL,
		)
		pe.Exercise.ID = pe.ExerciseID
		pe.Sets = loadProgramSets(pe.ID)
		exercises = append(exercises, pe)
	}
	return exercises
}

func loadProgramSets(programExerciseID int64) []models.ProgramSet {
	rows, err := db.DB.Query(
		`SELECT id, program_exercise_id, set_number, target_reps, target_weight
		 FROM program_sets WHERE program_exercise_id = ? ORDER BY set_number`,
		programExerciseID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var sets []models.ProgramSet
	for rows.Next() {
		var s models.ProgramSet
		rows.Scan(&s.ID, &s.ProgramExerciseID, &s.SetNumber, &s.TargetReps, &s.TargetWeight)
		sets = append(sets, s)
	}
	return sets
}

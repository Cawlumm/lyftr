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
			`INSERT INTO program_exercises (program_id, exercise_id, order_index, notes) VALUES (?, ?, ?, ?)`,
			pid, ex.ExerciseID, i, ex.Notes,
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
		`SELECT pe.id, pe.program_id, pe.exercise_id, pe.order_index, pe.notes,
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
			&pe.ID, &pe.ProgramID, &pe.ExerciseID, &pe.OrderIndex, &pe.Notes,
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
		`SELECT id, program_exercise_id, set_number, target_reps, target_weight
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
		if err := rows.Scan(&st.ID, &st.ProgramExerciseID, &st.SetNumber, &st.TargetReps, &st.TargetWeight); err != nil {
			return nil, err
		}
		sets = append(sets, st)
	}
	return sets, rows.Err()
}

package stores

import (
	"database/sql"
	"fmt"

	"github.com/Cawlumm/lyftr-backend/models"
)

// FoodStore owns all SQL for food_logs and saved_foods.
type FoodStore struct{ db *sql.DB }

func NewFoodStore(db *sql.DB) *FoodStore { return &FoodStore{db: db} }

const foodLogSelect = `SELECT id, user_id, name, meal, calories, protein, carbs, fat, fiber, servings, serving_size, barcode, image_url, logged_at, created_at FROM food_logs`

func scanFoodLog(row interface{ Scan(...any) error }, f *models.FoodLog) error {
	return row.Scan(
		&f.ID, &f.UserID, &f.Name, &f.Meal,
		&f.Calories, &f.Protein, &f.Carbs, &f.Fat, &f.Fiber,
		&f.Servings, &f.ServingSize, &f.Barcode, &f.ImageURL,
		&f.LoggedAt, &f.CreatedAt,
	)
}

func (s *FoodStore) ListByDay(uid int64, date string) ([]models.FoodLog, error) {
	rows, err := s.db.Query(
		foodLogSelect+` WHERE user_id = ? AND substr(logged_at, 1, 10) = ? ORDER BY logged_at ASC`,
		uid, date,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	logs := []models.FoodLog{}
	for rows.Next() {
		var f models.FoodLog
		if err := scanFoodLog(rows, &f); err != nil {
			return nil, err
		}
		logs = append(logs, f)
	}
	return logs, rows.Err()
}

// Get returns one user-owned food log, or sql.ErrNoRows.
func (s *FoodStore) Get(uid, id int64) (models.FoodLog, error) {
	var f models.FoodLog
	err := scanFoodLog(s.db.QueryRow(foodLogSelect+` WHERE id = ? AND user_id = ?`, id, uid), &f)
	return f, err
}

func (s *FoodStore) Create(uid int64, req models.LogFoodRequest) (models.FoodLog, error) {
	res, err := s.db.Exec(
		`INSERT INTO food_logs (user_id, name, meal, calories, protein, carbs, fat, fiber, servings, serving_size, barcode, image_url, logged_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid, req.Name, req.Meal, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber,
		req.Servings, req.ServingSize, req.Barcode, req.ImageURL, req.LoggedAt,
	)
	if err != nil {
		return models.FoodLog{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(uid, id)
}

func (s *FoodStore) Update(uid, id int64, req models.LogFoodRequest) (models.FoodLog, error) {
	res, err := s.db.Exec(
		`UPDATE food_logs SET name=?, meal=?, calories=?, protein=?, carbs=?, fat=?, fiber=?,
		 servings=?, serving_size=?, barcode=?, image_url=?, logged_at=?
		 WHERE id=? AND user_id=?`,
		req.Name, req.Meal, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber,
		req.Servings, req.ServingSize, req.Barcode, req.ImageURL, req.LoggedAt,
		id, uid,
	)
	if err != nil {
		return models.FoodLog{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return models.FoodLog{}, sql.ErrNoRows
	}
	return s.Get(uid, id)
}

func (s *FoodStore) Delete(uid, id int64) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM food_logs WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// DailyMacros returns the day's summed macros (WorkoutCount/Date are filled by
// the caller, which composes a WorkoutStore count — cross-entity stays in the
// controller, not in a store).
func (s *FoodStore) DailyMacros(uid int64, date string) (models.DailyStats, error) {
	var stats models.DailyStats
	err := s.db.QueryRow(
		`SELECT COALESCE(SUM(calories),0), COALESCE(SUM(protein),0),
		        COALESCE(SUM(carbs),0), COALESCE(SUM(fat),0), COALESCE(SUM(fiber),0)
		 FROM food_logs WHERE user_id = ? AND substr(logged_at, 1, 10) = ?`,
		uid, date,
	).Scan(&stats.TotalCalories, &stats.TotalProtein, &stats.TotalCarbs, &stats.TotalFat, &stats.TotalFiber)
	return stats, err
}

func (s *FoodStore) History(uid int64, days int) ([]models.FoodHistoryPoint, error) {
	rows, err := s.db.Query(
		`SELECT substr(logged_at, 1, 10) as d,
		        COALESCE(SUM(calories),0), COALESCE(SUM(protein),0),
		        COALESCE(SUM(carbs),0), COALESCE(SUM(fat),0)
		 FROM food_logs
		 WHERE user_id = ? AND logged_at >= date('now', ?)
		 GROUP BY d ORDER BY d ASC`,
		uid, fmt.Sprintf("-%d days", days),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	points := []models.FoodHistoryPoint{}
	for rows.Next() {
		var p models.FoodHistoryPoint
		if err := rows.Scan(&p.Date, &p.Calories, &p.Protein, &p.Carbs, &p.Fat); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

const savedFoodSelect = `SELECT id, user_id, name, brand, calories, protein, carbs, fat, fiber, serving_size, barcode, created_at FROM saved_foods`

func scanSavedFood(row interface{ Scan(...any) error }, f *models.SavedFood) error {
	return row.Scan(&f.ID, &f.UserID, &f.Name, &f.Brand, &f.Calories, &f.Protein, &f.Carbs, &f.Fat,
		&f.Fiber, &f.ServingSize, &f.Barcode, &f.CreatedAt)
}

func (s *FoodStore) ListSaved(uid int64) ([]models.SavedFood, error) {
	rows, err := s.db.Query(savedFoodSelect+` WHERE user_id = ? ORDER BY name ASC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	foods := []models.SavedFood{}
	for rows.Next() {
		var f models.SavedFood
		if err := scanSavedFood(rows, &f); err != nil {
			return nil, err
		}
		foods = append(foods, f)
	}
	return foods, rows.Err()
}

func (s *FoodStore) CreateSaved(uid int64, req models.SaveFoodRequest) (models.SavedFood, error) {
	res, err := s.db.Exec(
		`INSERT INTO saved_foods (user_id, name, brand, calories, protein, carbs, fat, fiber, serving_size, barcode)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid, req.Name, req.Brand, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber,
		req.ServingSize, req.Barcode,
	)
	if err != nil {
		return models.SavedFood{}, err
	}
	id, _ := res.LastInsertId()
	var f models.SavedFood
	err = scanSavedFood(s.db.QueryRow(savedFoodSelect+` WHERE id = ?`, id), &f)
	return f, err
}

func (s *FoodStore) DeleteSaved(uid, id int64) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM saved_foods WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

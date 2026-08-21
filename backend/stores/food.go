package stores

import (
	"database/sql"

	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/utils"
)

// FoodStore owns all SQL for food_logs and saved_foods.
type FoodStore struct{ db *sql.DB }

func NewFoodStore(db *sql.DB) *FoodStore { return &FoodStore{db: db} }

// foodDay is the day a row is filed under — same rule and same reason as weightDay:
// logged_on defaults to ” and the backfill leaves it unset for a row whose stored
// instant is unreadable, which would otherwise drop that entry out of its own diary
// day and out of every history bucket.
const foodDay = `CASE
	  WHEN logged_on <> '' THEN logged_on
	  WHEN logged_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' THEN substr(logged_at, 1, 10)
	END`

const foodLogSelect = `SELECT id, user_id, name, meal, calories, protein, carbs, fat, fiber, servings, serving_size, barcode, image_url, logged_at, logged_on, created_at FROM food_logs`

func scanFoodLog(row interface{ Scan(...any) error }, f *models.FoodLog) error {
	return row.Scan(
		&f.ID, &f.UserID, &f.Name, &f.Meal,
		&f.Calories, &f.Protein, &f.Carbs, &f.Fat, &f.Fiber,
		&f.Servings, &f.ServingSize, &f.Barcode, &f.ImageURL,
		&f.LoggedAt, &f.LoggedOn, &f.CreatedAt,
	)
}

// ListByDay returns the entries the user filed under `day` (YYYY-MM-DD).
//
// A plain equality on the stored day, not an instant range: the day was decided when
// the entry was written, so reading it needs no zone and cannot move. Ordered by the
// instant so entries still read in the order they happened within the day.
func (s *FoodStore) ListByDay(uid int64, day string) ([]models.FoodLog, error) {
	rows, err := s.db.Query(
		foodLogSelect+` WHERE user_id = ? AND `+foodDay+` = ? ORDER BY logged_at ASC, id ASC`,
		uid, day,
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

// Create inserts an entry. day is the calendar day the user files it under, resolved
// by the controller (client-supplied when sent, else from the account zone).
func (s *FoodStore) Create(uid int64, req models.LogFoodRequest, day string) (models.FoodLog, error) {
	res, err := s.db.Exec(
		`INSERT INTO food_logs (user_id, name, meal, calories, protein, carbs, fat, fiber, servings, serving_size, barcode, image_url, logged_at, logged_on)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid, req.Name, req.Meal, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber,
		req.Servings, req.ServingSize, req.Barcode, req.ImageURL, req.LoggedAt, day,
	)
	if err != nil {
		return models.FoodLog{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(uid, id)
}

func (s *FoodStore) Update(uid, id int64, req models.LogFoodRequest, day string) (models.FoodLog, error) {
	res, err := s.db.Exec(
		`UPDATE food_logs SET name=?, meal=?, calories=?, protein=?, carbs=?, fat=?, fiber=?,
		 servings=?, serving_size=?, barcode=?, image_url=?, logged_at=?, logged_on=?
		 WHERE id=? AND user_id=?`,
		req.Name, req.Meal, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber,
		req.Servings, req.ServingSize, req.Barcode, req.ImageURL, req.LoggedAt, day,
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
func (s *FoodStore) DailyMacros(uid int64, day string) (models.DailyStats, error) {
	var stats models.DailyStats
	err := s.db.QueryRow(
		`SELECT COALESCE(SUM(calories),0), COALESCE(SUM(protein),0),
		        COALESCE(SUM(carbs),0), COALESCE(SUM(fat),0), COALESCE(SUM(fiber),0)
		 FROM food_logs WHERE user_id = ? AND `+foodDay+` = ?`,
		uid, day,
	).Scan(&stats.TotalCalories, &stats.TotalProtein, &stats.TotalCarbs, &stats.TotalFat, &stats.TotalFiber)
	return stats, err
}

// History returns per-day macro totals from sinceDay (YYYY-MM-DD) onward.
//
// Grouped in SQL now that the day is a stored column. The previous version read every
// row in the window and bucketed it in Go, because the day had to be derived through
// an IANA zone that SQLite cannot represent. Nothing needs deriving any more, so the
// chart totals and the daily totals are the same GROUP BY over the same column and
// cannot disagree about which day an entry belongs to.
func (s *FoodStore) History(uid int64, sinceDay string) ([]models.FoodHistoryPoint, error) {
	rows, err := s.db.Query(
		`SELECT `+foodDay+` AS day,
		        COALESCE(SUM(calories),0), COALESCE(SUM(protein),0),
		        COALESCE(SUM(carbs),0), COALESCE(SUM(fat),0)
		 FROM food_logs
		 WHERE user_id = ? AND `+foodDay+` >= ?
		 GROUP BY day
		 ORDER BY day ASC`,
		uid, sinceDay,
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

// CreateSaved stars a food, and is idempotent: starring something already in Favorites
// returns the existing row rather than adding a second copy. `created` reports which
// happened so the handler can answer 201 or 200.
//
// The clients already show the star as filled once a food is favourited, but that check
// reads a list fetched when the screen opened. Two devices, or one device with a stale
// list, would otherwise race straight into the unique index and surface a 500 for what
// is simply "already favourited".
func (s *FoodStore) CreateSaved(uid int64, req models.SaveFoodRequest) (f models.SavedFood, created bool, err error) {
	res, err := s.db.Exec(
		`INSERT INTO saved_foods (user_id, name, brand, calories, protein, carbs, fat, fiber, serving_size, barcode)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uid, req.Name, req.Brand, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber,
		req.ServingSize, req.Barcode,
	)
	if err != nil {
		if !utils.IsUniqueViolation(err) {
			return models.SavedFood{}, false, err
		}
		// If the row is deleted between the failed insert and this read the scan returns
		// sql.ErrNoRows and the caller answers 500. That needs an unstar to land in the
		// gap between two statements on a pool of one connection; a retry loop costs more
		// than the case is worth, and the client's next action refetches anyway.
		err = scanSavedFood(
			s.db.QueryRow(savedFoodSelect+` WHERE user_id = ? AND name = ? AND brand = ?`, uid, req.Name, req.Brand),
			&f,
		)
		return f, false, err
	}
	id, _ := res.LastInsertId()
	err = scanSavedFood(s.db.QueryRow(savedFoodSelect+` WHERE id = ?`, id), &f)
	return f, true, err
}

func (s *FoodStore) DeleteSaved(uid, id int64) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM saved_foods WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

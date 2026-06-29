package stores

import (
	"database/sql"

	"github.com/Cawlumm/lyftr-backend/models"
)

// UserStore owns all SQL for users and user_settings.
type UserStore struct{ db *sql.DB }

func NewUserStore(db *sql.DB) *UserStore { return &UserStore{db: db} }

func (s *UserStore) GetMe(uid int64) (models.User, error) {
	var u models.User
	err := s.db.QueryRow(`SELECT id, email, created_at, updated_at FROM users WHERE id = ?`, uid).
		Scan(&u.ID, &u.Email, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

// GetByEmail loads a user incl. password_hash for login. sql.ErrNoRows if absent.
func (s *UserStore) GetByEmail(email string) (models.User, error) {
	var u models.User
	err := s.db.QueryRow(
		`SELECT id, email, password_hash, created_at, updated_at FROM users WHERE email = ?`, email,
	).Scan(&u.ID, &u.Email, &u.Password, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

const userSettingsSelect = `SELECT user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target FROM user_settings`

// GetSettings returns the user's settings row, or sql.ErrNoRows if none (the
// controller owns the default fallback).
func (s *UserStore) GetSettings(uid int64) (models.UserSettings, error) {
	var st models.UserSettings
	err := s.db.QueryRow(userSettingsSelect+` WHERE user_id = ?`, uid).
		Scan(&st.UserID, &st.WeightUnit, &st.CalorieTarget, &st.ProteinTarget, &st.CarbTarget, &st.FatTarget)
	return st, err
}

// UpsertSettings writes the settings and returns the stored row (no controller-
// to-controller call to render the response).
func (s *UserStore) UpsertSettings(uid int64, req models.UpdateSettingsRequest) (models.UserSettings, error) {
	if _, err := s.db.Exec(
		`INSERT INTO user_settings (user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   weight_unit    = excluded.weight_unit,
		   calorie_target = excluded.calorie_target,
		   protein_target = excluded.protein_target,
		   carb_target    = excluded.carb_target,
		   fat_target     = excluded.fat_target`,
		uid, req.WeightUnit, req.CalorieTarget, req.ProteinTarget, req.CarbTarget, req.FatTarget,
	); err != nil {
		return models.UserSettings{}, err
	}
	return s.GetSettings(uid)
}

// Create inserts a user and their default settings atomically (one transaction —
// fixes the previous non-transactional gap). A duplicate email surfaces as a
// UNIQUE violation for the controller to map to 409.
func (s *UserStore) Create(email, hash string) (int64, error) {
	return inTx(s.db, func(tx *sql.Tx) (int64, error) {
		res, err := tx.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, email, hash)
		if err != nil {
			return 0, err
		}
		uid, _ := res.LastInsertId()
		if _, err := tx.Exec(`INSERT INTO user_settings (user_id) VALUES (?)`, uid); err != nil {
			return 0, err
		}
		return uid, nil
	})
}

// Delete removes the user; child rows go via ON DELETE CASCADE (foreign_keys=on).
func (s *UserStore) Delete(uid int64) error {
	_, err := s.db.Exec(`DELETE FROM users WHERE id = ?`, uid)
	return err
}

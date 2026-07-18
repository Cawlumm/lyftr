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

// UpsertSettings applies a partial update and returns the merged row in a single
// atomic statement. For each field the nullable request value is COALESCEd over
// the default (on insert) or over the existing row (on conflict), so a partial PUT
// (e.g. weight-unit only) can never zero the fields it omitted (#37). Doing it in
// one INSERT…ON CONFLICT…RETURNING avoids a read-modify-write window where two
// concurrent partial updates could lose one another's change, and returns the
// stored row without a second SELECT. A nil pointer binds as SQL NULL; a non-nil
// pointer (incl. an explicit 0) binds as its value, so intentional zeros survive.
func (s *UserStore) UpsertSettings(uid int64, req models.UpdateSettingsRequest) (models.UserSettings, error) {
	d := models.DefaultUserSettings(uid)
	var st models.UserSettings
	err := s.db.QueryRow(
		`INSERT INTO user_settings (user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target)
		 VALUES (?, COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?))
		 ON CONFLICT(user_id) DO UPDATE SET
		   weight_unit    = COALESCE(?, user_settings.weight_unit),
		   calorie_target = COALESCE(?, user_settings.calorie_target),
		   protein_target = COALESCE(?, user_settings.protein_target),
		   carb_target    = COALESCE(?, user_settings.carb_target),
		   fat_target     = COALESCE(?, user_settings.fat_target)
		 RETURNING user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target`,
		uid,
		req.WeightUnit, d.WeightUnit,
		req.CalorieTarget, d.CalorieTarget,
		req.ProteinTarget, d.ProteinTarget,
		req.CarbTarget, d.CarbTarget,
		req.FatTarget, d.FatTarget,
		req.WeightUnit, req.CalorieTarget, req.ProteinTarget, req.CarbTarget, req.FatTarget,
	).Scan(&st.UserID, &st.WeightUnit, &st.CalorieTarget, &st.ProteinTarget, &st.CarbTarget, &st.FatTarget)
	if err != nil {
		return models.UserSettings{}, err
	}
	return st, nil
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

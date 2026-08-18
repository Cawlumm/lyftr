package stores

import (
	"database/sql"
	"errors"

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
		`SELECT id, email, password_hash, token_version, created_at, updated_at FROM users WHERE email = ?`, email,
	).Scan(&u.ID, &u.Email, &u.Password, &u.TokenVersion, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

// GetByID is GetByEmail for an already-authenticated caller: it carries the hash, so
// the password-change handler can verify the current password without trusting the
// email in the token. sql.ErrNoRows if the account was deleted mid-session.
func (s *UserStore) GetByID(uid int64) (models.User, error) {
	var u models.User
	err := s.db.QueryRow(
		`SELECT id, email, password_hash, token_version, created_at, updated_at FROM users WHERE id = ?`, uid,
	).Scan(&u.ID, &u.Email, &u.Password, &u.TokenVersion, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

// TokenVersion returns the account's current token generation, or sql.ErrNoRows if the
// account is gone. Read on refresh only — never on the per-request auth path, which
// stays free of database work.
func (s *UserStore) TokenVersion(uid int64) (int, error) {
	var v int
	err := s.db.QueryRow(`SELECT token_version FROM users WHERE id = ?`, uid).Scan(&v)
	return v, err
}

// ErrPasswordChanged means the stored hash moved between the handler reading it and
// this update running — a second password change racing the first.
var ErrPasswordChanged = errors.New("password changed concurrently")

// ChangePassword swaps the hash and invalidates every token minted against the old one,
// returning the new token version so the caller can re-issue a pair for the device that
// made the change.
//
// The UPDATE is conditional on the hash the handler verified. Two concurrent changes
// would otherwise both pass verification against the same old hash and both write, so
// the loser's password would silently win while its user was told it had been set —
// and both would land on token_version+1 rather than +2, leaving the first change's
// tokens alive. Compare-and-set makes the loser fail loudly instead.
func (s *UserStore) ChangePassword(uid int64, oldHash, newHash string) (int, error) {
	if newHash == "" {
		return 0, ErrEmptyHash
	}
	v, err := inTx(s.db, func(tx *sql.Tx) (int64, error) {
		res, err := tx.Exec(
			`UPDATE users SET password_hash = ?, token_version = token_version + 1,
			                  updated_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND password_hash = ?`, newHash, uid, oldHash)
		if err != nil {
			return 0, err
		}
		n, err := res.RowsAffected()
		if err != nil {
			return 0, err
		}
		if n == 0 {
			return 0, ErrPasswordChanged
		}
		var v int
		if err := tx.QueryRow(`SELECT token_version FROM users WHERE id = ?`, uid).Scan(&v); err != nil {
			return 0, err
		}
		return int64(v), nil
	})
	return int(v), err
}

const userSettingsSelect = `SELECT user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target, timezone FROM user_settings`

// GetSettings returns the user's settings row, or sql.ErrNoRows if none (the
// controller owns the default fallback).
func (s *UserStore) GetSettings(uid int64) (models.UserSettings, error) {
	var st models.UserSettings
	err := s.db.QueryRow(userSettingsSelect+` WHERE user_id = ?`, uid).
		Scan(&st.UserID, &st.WeightUnit, &st.CalorieTarget, &st.ProteinTarget, &st.CarbTarget, &st.FatTarget, &st.Timezone)
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
		`INSERT INTO user_settings (user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target, timezone)
		 VALUES (?, COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?))
		 ON CONFLICT(user_id) DO UPDATE SET
		   weight_unit    = COALESCE(?, user_settings.weight_unit),
		   calorie_target = COALESCE(?, user_settings.calorie_target),
		   protein_target = COALESCE(?, user_settings.protein_target),
		   carb_target    = COALESCE(?, user_settings.carb_target),
		   fat_target     = COALESCE(?, user_settings.fat_target),
		   timezone       = COALESCE(?, user_settings.timezone)
		 RETURNING user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target, timezone`,
		uid,
		req.WeightUnit, d.WeightUnit,
		req.CalorieTarget, d.CalorieTarget,
		req.ProteinTarget, d.ProteinTarget,
		req.CarbTarget, d.CarbTarget,
		req.FatTarget, d.FatTarget,
		req.Timezone, d.Timezone,
		req.WeightUnit, req.CalorieTarget, req.ProteinTarget, req.CarbTarget, req.FatTarget, req.Timezone,
	).Scan(&st.UserID, &st.WeightUnit, &st.CalorieTarget, &st.ProteinTarget, &st.CarbTarget, &st.FatTarget, &st.Timezone)
	if err != nil {
		return models.UserSettings{}, err
	}
	return st, nil
}

// ErrRegistrationClosed means the instance is in first-user mode and the slot was
// taken — by the owner, or by whoever raced them to it.
var ErrRegistrationClosed = errors.New("registration is closed")

// Count returns the number of accounts. Drives first-user mode and the
// registration_open flag on /info.
func (s *UserStore) Count() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// Create inserts a user and their default settings atomically (one transaction —
// fixes the previous non-transactional gap). A duplicate email surfaces as a
// UNIQUE violation for the controller to map to 409.
func (s *UserStore) Create(email, hash string) (int64, error) {
	return inTx(s.db, func(tx *sql.Tx) (int64, error) {
		return createUserTx(tx, email, hash)
	})
}

// CreateFirst is Create for first-user mode: it re-counts inside the transaction and
// refuses if anyone got there first. The controller's pre-check is only a fast reject —
// on a fresh public instance a scraper and the owner can both observe an empty table
// and both be allowed through, which is the exact race this mode exists to prevent.
func (s *UserStore) CreateFirst(email, hash string) (int64, error) {
	return inTx(s.db, func(tx *sql.Tx) (int64, error) {
		var n int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
			return 0, err
		}
		if n > 0 {
			return 0, ErrRegistrationClosed
		}
		return createUserTx(tx, email, hash)
	})
}

func createUserTx(tx *sql.Tx, email, hash string) (int64, error) {
	res, err := tx.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, email, hash)
	if err != nil {
		return 0, err
	}
	uid, _ := res.LastInsertId()
	if _, err := tx.Exec(`INSERT INTO user_settings (user_id) VALUES (?)`, uid); err != nil {
		return 0, err
	}
	return uid, nil
}

// ErrEmptyHash guards the two statements that WRITE a password. Everywhere else an
// empty argument simply matches no rows and surfaces as an error, so a guard would be
// noise -- but these two would store the empty string, and bcrypt rejects it against
// every password, silently locking the account out while still bumping token_version.
// A caller that forgets to hash should fail loudly instead.
var ErrEmptyHash = errors.New("refusing to store an empty password hash")

// ErrNoSuchUser means no account carries that address.
var ErrNoSuchUser = errors.New("no account with that email")

// FindEmailFold returns the stored address matching email case-insensitively, or
// sql.ErrNoRows. Addresses are stored and matched exactly everywhere else — including at
// login — so this exists only to turn "no account found" into a useful message for an
// operator who typed the wrong case while recovering an account. It must not become a way
// to authenticate, which is why it returns the stored spelling rather than the row.
func (s *UserStore) FindEmailFold(email string) (string, error) {
	var stored string
	err := s.db.QueryRow(
		`SELECT email FROM users WHERE email = ? COLLATE NOCASE`, email,
	).Scan(&stored)
	return stored, err
}

// ResetPassword is the operator's way in, for the account whose password is lost. Unlike
// ChangePassword there is no old hash to verify against — the whole point is that nobody
// knows it — so this is keyed on email and guarded only by having a shell on the server.
//
// It bumps token_version for the same reason the in-app change does, and here it matters
// more: an operator resetting a password may be doing it because someone else got in, and
// a new password is worthless while the intruder's refresh token still mints access
// tokens for the rest of its 30 days.
func (s *UserStore) ResetPassword(email, newHash string) error {
	if newHash == "" {
		return ErrEmptyHash
	}
	res, err := s.db.Exec(
		`UPDATE users SET password_hash = ?, token_version = token_version + 1,
		                  updated_at = CURRENT_TIMESTAMP
		 WHERE email = ?`, newHash, email)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNoSuchUser
	}
	return nil
}

// Delete removes the user; child rows go via ON DELETE CASCADE (foreign_keys=on).
func (s *UserStore) Delete(uid int64) error {
	_, err := s.db.Exec(`DELETE FROM users WHERE id = ?`, uid)
	return err
}


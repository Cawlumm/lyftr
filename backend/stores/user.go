package stores

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

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

// ErrAmbiguousEmail means an address matches several accounts that differ only in letter
// case, and none of them is spelled exactly as given.
var ErrAmbiguousEmail = errors.New("address matches several accounts")

// ErrEmailTaken means another account already holds the address, ignoring letter case.
var ErrEmailTaken = errors.New("email already registered")

// matchEmail is the one place an address becomes an account. NOCASE decides what "the
// same address" means (no Go code folds case, so Go and SQL cannot disagree): an exact
// spelling wins, otherwise a single match is used, and several matches with no exact one
// are ambiguous. It returns every spelling found alongside ErrAmbiguousEmail. All rows
// are read and closed before returning: the pool has one connection.
func (s *UserStore) matchEmail(email string) (models.User, []string, error) {
	rows, err := s.db.Query(
		`SELECT id, email, password_hash, token_version, created_at, updated_at
		 FROM users WHERE email = ? COLLATE NOCASE ORDER BY id`, email)
	if err != nil {
		return models.User{}, nil, err
	}
	var found []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Password, &u.TokenVersion, &u.CreatedAt, &u.UpdatedAt); err != nil {
			rows.Close()
			return models.User{}, nil, err
		}
		found = append(found, u)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return models.User{}, nil, err
	}
	for _, u := range found {
		if u.Email == email {
			return u, nil, nil
		}
	}
	switch len(found) {
	case 0:
		return models.User{}, nil, sql.ErrNoRows
	case 1:
		return found[0], nil, nil
	}
	spellings := make([]string, len(found))
	for i, u := range found {
		spellings[i] = u.Email
	}
	return models.User{}, spellings, ErrAmbiguousEmail
}

// GetByEmail loads a user incl. password_hash for login, matching the address
// case-insensitively. sql.ErrNoRows if absent, and also if it is ambiguous between
// case-variant accounts, so login answers both the same way.
func (s *UserStore) GetByEmail(email string) (models.User, error) {
	u, _, err := s.matchEmail(email)
	if errors.Is(err, ErrAmbiguousEmail) {
		return models.User{}, sql.ErrNoRows
	}
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
// account is gone. Read on refresh and, by the auth middleware, on every authenticated
// request: it is a primary-key read, and it is what makes a deleted account or an ended
// session stop working at once rather than when its access token expires.
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

const userSettingsSelect = `SELECT user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target, timezone, display_name FROM user_settings`

// GetSettings returns the user's settings row, or sql.ErrNoRows if none (the
// controller owns the default fallback).
func (s *UserStore) GetSettings(uid int64) (models.UserSettings, error) {
	var st models.UserSettings
	err := s.db.QueryRow(userSettingsSelect+` WHERE user_id = ?`, uid).
		Scan(&st.UserID, &st.WeightUnit, &st.CalorieTarget, &st.ProteinTarget, &st.CarbTarget, &st.FatTarget, &st.Timezone, &st.DisplayName)
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
		`INSERT INTO user_settings (user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target, timezone, display_name)
		 VALUES (?, COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?), COALESCE(?, ?))
		 ON CONFLICT(user_id) DO UPDATE SET
		   weight_unit    = COALESCE(?, user_settings.weight_unit),
		   calorie_target = COALESCE(?, user_settings.calorie_target),
		   protein_target = COALESCE(?, user_settings.protein_target),
		   carb_target    = COALESCE(?, user_settings.carb_target),
		   fat_target     = COALESCE(?, user_settings.fat_target),
		   timezone       = COALESCE(?, user_settings.timezone),
		   display_name   = COALESCE(?, user_settings.display_name)
		 RETURNING user_id, weight_unit, calorie_target, protein_target, carb_target, fat_target, timezone, display_name`,
		uid,
		req.WeightUnit, d.WeightUnit,
		req.CalorieTarget, d.CalorieTarget,
		req.ProteinTarget, d.ProteinTarget,
		req.CarbTarget, d.CarbTarget,
		req.FatTarget, d.FatTarget,
		req.Timezone, d.Timezone,
		req.DisplayName, d.DisplayName,
		req.WeightUnit, req.CalorieTarget, req.ProteinTarget, req.CarbTarget, req.FatTarget, req.Timezone, req.DisplayName,
	).Scan(&st.UserID, &st.WeightUnit, &st.CalorieTarget, &st.ProteinTarget, &st.CarbTarget, &st.FatTarget, &st.Timezone, &st.DisplayName)
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
	if err := emailTakenTx(tx, email, 0); err != nil {
		return 0, err
	}
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

// emailTakenTx returns ErrEmailTaken when an account other than exceptID holds the
// address, ignoring letter case.
// The unique index cannot exist on an install that already holds case-variant accounts, so check here too.
func emailTakenTx(tx *sql.Tx, email string, exceptID int64) error {
	var taken int
	switch err := tx.QueryRow(`SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id != ? LIMIT 1`, email, exceptID).Scan(&taken); {
	case err == nil:
		return ErrEmailTaken
	case !errors.Is(err, sql.ErrNoRows):
		return err
	}
	return nil
}

// ChangeEmail moves the account to a new address and returns the updated user. The
// check and the write share one transaction because the case-insensitive unique index
// is absent on installs that hold case-variant accounts. The UPDATE is conditional on
// the hash the handler verified, as in ChangePassword. It bumps token_version, as
// ChangePassword does, so every other session ends; the returned user carries the version
// for the handler to mint this device's replacement tokens at.
//
// A change of letter case alone bumps nothing. Sign-in is case-insensitive, so the identity
// did not change and there is nothing to contain; ending a phone's session over a
// capitalisation fix would be pure cost. The comparison is SQLite's NOCASE, the same rule
// that decides "same address" everywhere else, so no Go code folds case.
func (s *UserStore) ChangeEmail(uid int64, verifiedHash, email string) (models.User, error) {
	var u models.User
	_, err := inTx(s.db, func(tx *sql.Tx) (int64, error) {
		if err := emailTakenTx(tx, email, uid); err != nil {
			return 0, err
		}
		res, err := tx.Exec(
			`UPDATE users SET token_version = token_version + CASE WHEN email = ? COLLATE NOCASE THEN 0 ELSE 1 END,
			                  email = ?, updated_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND password_hash = ?`, email, email, uid, verifiedHash)
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
		return 0, tx.QueryRow(`SELECT id, email, token_version, created_at, updated_at FROM users WHERE id = ?`, uid).
			Scan(&u.ID, &u.Email, &u.TokenVersion, &u.CreatedAt, &u.UpdatedAt)
	})
	return u, err
}

// ErrEmptyHash guards the two statements that WRITE a password. Everywhere else an
// empty argument simply matches no rows and surfaces as an error, so a guard would be
// noise -- but these two would store the empty string, and bcrypt rejects it against
// every password, silently locking the account out while still bumping token_version.
// A caller that forgets to hash should fail loudly instead.
var ErrEmptyHash = errors.New("refusing to store an empty password hash")

// ErrNoSuchUser means no account carries that address.
var ErrNoSuchUser = errors.New("no account with that email")

// ResetPassword is the operator's way in, for the account whose password is lost. Unlike
// ChangePassword there is no old hash to verify against — the whole point is that nobody
// knows it — so this is keyed on email and guarded only by having a shell on the server.
//
// It bumps token_version for the same reason the in-app change does, and here it matters
// more: an operator resetting a password may be doing it because someone else got in, and
// a new password is worthless while the intruder's refresh token still mints access
// tokens for the rest of its 30 days.
//
// It returns the address as stored, because the one passed in may differ from it in letter
// case and the operator should see which account was actually changed.
func (s *UserStore) ResetPassword(email, newHash string) (string, error) {
	if newHash == "" {
		return "", ErrEmptyHash
	}
	u, spellings, err := s.matchEmail(email)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNoSuchUser
	}
	if errors.Is(err, ErrAmbiguousEmail) {
		return "", fmt.Errorf("%w: %s", ErrAmbiguousEmail, strings.Join(spellings, ", "))
	}
	if err != nil {
		return "", err
	}
	res, err := s.db.Exec(
		`UPDATE users SET password_hash = ?, token_version = token_version + 1,
		                  updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`, newHash, u.ID)
	if err != nil {
		return "", err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return "", err
	}
	if n == 0 {
		return "", ErrNoSuchUser
	}
	return u.Email, nil
}

// Delete removes the user; child rows go via ON DELETE CASCADE (foreign_keys=on).
func (s *UserStore) Delete(uid int64) error {
	_, err := s.db.Exec(`DELETE FROM users WHERE id = ?`, uid)
	return err
}

// ErrInexactEmail means an address matches an account only when letter case is ignored.
var ErrInexactEmail = errors.New("address matches only with different letter case")

// GetByExactEmail is the lookup for destructive operator commands, which must never
// resolve an address by folding case. It layers one check on matchEmail so NOCASE
// semantics stay in one place. When no account is spelled exactly as given but some match
// ignoring case, it returns ErrInexactEmail with every stored spelling.
func (s *UserStore) GetByExactEmail(email string) (models.User, []string, error) {
	u, spellings, err := s.matchEmail(email)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return models.User{}, nil, ErrNoSuchUser
	case errors.Is(err, ErrAmbiguousEmail):
		return models.User{}, spellings, ErrInexactEmail
	case err != nil:
		return models.User{}, nil, err
	case u.Email != email:
		return models.User{}, []string{u.Email}, ErrInexactEmail
	}
	return u, nil, nil
}

// AccountData is how much an account holds, for showing an operator what a delete takes.
type AccountData struct {
	Workouts, Sets, FoodLogs, WeightLogs, Programs, SavedFoods, ActiveSessions int
}

// CountData counts the rows Delete will cascade through for one account. It mirrors the
// user-owned tables in the schema; a test pins that mirror against the foreign keys.
// user_settings is not counted: every account has exactly one.
func (s *UserStore) CountData(uid int64) (AccountData, error) {
	var d AccountData
	err := s.db.QueryRow(`SELECT
		(SELECT COUNT(*) FROM workouts WHERE user_id = ?),
		(SELECT COUNT(*) FROM sets st
			JOIN workout_exercises we ON we.id = st.workout_exercise_id
			JOIN workouts w ON w.id = we.workout_id WHERE w.user_id = ?),
		(SELECT COUNT(*) FROM food_logs WHERE user_id = ?),
		(SELECT COUNT(*) FROM weight_logs WHERE user_id = ?),
		(SELECT COUNT(*) FROM programs WHERE user_id = ?),
		(SELECT COUNT(*) FROM saved_foods WHERE user_id = ?),
		(SELECT COUNT(*) FROM active_sessions WHERE user_id = ?)`,
		uid, uid, uid, uid, uid, uid, uid).
		Scan(&d.Workouts, &d.Sets, &d.FoodLogs, &d.WeightLogs, &d.Programs, &d.SavedFoods, &d.ActiveSessions)
	return d, err
}

package stores

import (
	"database/sql"
	"time"
)

// ActiveSessionStore owns all SQL for the active_session entity.
type ActiveSessionStore struct{ db *sql.DB }

func NewActiveSessionStore(db *sql.DB) *ActiveSessionStore { return &ActiveSessionStore{db: db} }

// Get returns the user's saved session blob. Returns sql.ErrNoRows if none.
func (s *ActiveSessionStore) Get(uid int64) (data string, updatedAt time.Time, err error) {
	err = s.db.QueryRow(
		`SELECT data, updated_at FROM active_sessions WHERE user_id = ?`, uid,
	).Scan(&data, &updatedAt)
	return
}

func (s *ActiveSessionStore) Upsert(uid int64, data string) error {
	_, err := s.db.Exec(
		`INSERT INTO active_sessions (user_id, data, updated_at)
		 VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
		uid, data,
	)
	return err
}

func (s *ActiveSessionStore) Delete(uid int64) error {
	_, err := s.db.Exec(`DELETE FROM active_sessions WHERE user_id = ?`, uid)
	return err
}

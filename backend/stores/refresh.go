package stores

import (
	"database/sql"
	"time"
)

// RefreshStore records every refresh token the server has issued, by its jti, so a token
// can be revoked (logout) and a replayed one can be told from a fresh one. Without it a
// refresh token is a bearer secret good for 30 days that nothing can take back, and a thief
// who copies it keeps a session alive alongside its owner for ever, since each refresh
// just hands over the next one.
//
// Times are unix seconds in INTEGER columns: the driver stores time.Time in a form SQLite's
// date functions cannot read (see CLAUDE.md), and nothing here needs more than comparison.
type RefreshStore struct{ db *sql.DB }

func NewRefreshStore(db *sql.DB) *RefreshStore { return &RefreshStore{db: db} }

// RotateResult is what presenting a refresh token's jti amounted to.
type RotateResult int

const (
	// RotateOK: first use. The token is now spent and the caller may mint its successor.
	RotateOK RotateResult = iota
	// RotateReplay: spent moments ago. A client whose response was lost in flight retries
	// with the token it still holds; treating that as theft would sign people out for
	// walking through a dead spot, so inside the grace window it is served again.
	RotateReplay
	// RotateReuse: spent longer ago than the grace window. Someone holds a copy of a token
	// that has already been rotated away, so the owner or a thief is presenting a stale
	// one. The caller revokes the user's sessions.
	RotateReuse
	// RotateRevoked: logged out.
	RotateRevoked
	// RotateUnknown: no such token for this user (purged, restored from backup, forged
	// claims behind a valid signature).
	RotateUnknown
)

// Issue records a freshly minted refresh token and drops rows whose tokens have expired
// anyway, which keeps the table to about a month of one person's refreshes.
func (s *RefreshStore) Issue(jti string, uid int64, now, expires time.Time) error {
	return inTxDo(s.db, func(tx *sql.Tx) error {
		if _, err := tx.Exec(`DELETE FROM refresh_tokens WHERE expires_at < ?`, now.Unix()); err != nil {
			return err
		}
		_, err := tx.Exec(
			`INSERT INTO refresh_tokens (jti, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
			jti, uid, expires.Unix(), now.Unix())
		return err
	})
}

// Rotate spends a token once. The decision and the write are one transaction on the
// single connection, so two simultaneous refreshes with the same token cannot both see it
// unspent: one gets RotateOK and the other RotateReplay.
func (s *RefreshStore) Rotate(jti string, uid int64, now time.Time, grace time.Duration) (RotateResult, error) {
	var res RotateResult
	err := inTxDo(s.db, func(tx *sql.Tx) error {
		var owner int64
		var used, revoked sql.NullInt64
		err := tx.QueryRow(`SELECT user_id, used_at, revoked_at FROM refresh_tokens WHERE jti = ?`, jti).
			Scan(&owner, &used, &revoked)
		switch {
		case err == sql.ErrNoRows || (err == nil && owner != uid):
			res = RotateUnknown
			return nil
		case err != nil:
			return err
		case revoked.Valid:
			res = RotateRevoked
			return nil
		case used.Valid:
			if now.Sub(time.Unix(used.Int64, 0)) <= grace {
				res = RotateReplay
			} else {
				res = RotateReuse
			}
			return nil
		}
		res = RotateOK
		_, err = tx.Exec(`UPDATE refresh_tokens SET used_at = ? WHERE jti = ?`, now.Unix(), jti)
		return err
	})
	return res, err
}

// Revoke marks one token unusable. Unknown or already revoked tokens are not an error:
// logout is idempotent.
func (s *RefreshStore) Revoke(jti string, uid int64, now time.Time) error {
	_, err := s.db.Exec(
		`UPDATE refresh_tokens SET revoked_at = ? WHERE jti = ? AND user_id = ? AND revoked_at IS NULL`,
		now.Unix(), jti, uid)
	return err
}

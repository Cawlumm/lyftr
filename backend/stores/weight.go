package stores

import (
	"database/sql"
	"time"

	"github.com/Cawlumm/lyftr-backend/models"
)

// WeightStore owns all SQL for the weight_logs entity.
type WeightStore struct{ db *sql.DB }

func NewWeightStore(db *sql.DB) *WeightStore { return &WeightStore{db: db} }

// WeightFilter holds resolved query bounds.
//
// Two kinds, because the API accepts two kinds. A bare YYYY-MM-DD is a question about
// the user's calendar and filters on the stored day; a full RFC3339 timestamp is a
// question about instants and filters on logged_at. Neither consults a zone.
type WeightFilter struct {
	Limit, Offset int
	From, To      *time.Time // instant bounds, for an exact RFC3339 range
	FromDay, ToDay *string   // inclusive day bounds, for a bare YYYY-MM-DD range
}

// WeightStats is the computed summary for GetWeightStats.
type WeightStats struct {
	Latest, Starting, Min, Max, Avg float64
	TotalEntries                    int
	Change7d, Change30d             float64
}

const weightCols = `id, user_id, weight, notes, logged_at, logged_on, created_at`

func (s *WeightStore) List(uid int64, f WeightFilter) ([]models.WeightLog, error) {
	q := `SELECT ` + weightCols + ` FROM weight_logs WHERE user_id = ?`
	args := []any{uid}
	if f.From != nil {
		q += ` AND logged_at >= ?`
		args = append(args, *f.From)
	}
	if f.To != nil {
		q += ` AND logged_at < ?`
		args = append(args, *f.To)
	}
	if f.FromDay != nil {
		q += ` AND logged_on >= ?`
		args = append(args, *f.FromDay)
	}
	if f.ToDay != nil {
		// Inclusive: the caller asked for a day, not an exclusive bound.
		q += ` AND logged_on <= ?`
		args = append(args, *f.ToDay)
	}
	q += ` ORDER BY logged_at DESC, id DESC LIMIT ? OFFSET ?`
	args = append(args, f.Limit, f.Offset)

	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	logs := []models.WeightLog{}
	for rows.Next() {
		var w models.WeightLog
		if err := rows.Scan(&w.ID, &w.UserID, &w.Weight, &w.Notes, &w.LoggedAt, &w.LoggedOn, &w.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, w)
	}
	return logs, rows.Err()
}

// get reads a single row by id (no user scope — used after a user-scoped write).
func (s *WeightStore) get(id int64) (models.WeightLog, error) {
	var w models.WeightLog
	err := s.db.QueryRow(`SELECT `+weightCols+` FROM weight_logs WHERE id = ?`, id).
		Scan(&w.ID, &w.UserID, &w.Weight, &w.Notes, &w.LoggedAt, &w.LoggedOn, &w.CreatedAt)
	return w, err
}

// Get returns one user-owned entry, or sql.ErrNoRows.
func (s *WeightStore) Get(uid, id int64) (models.WeightLog, error) {
	var w models.WeightLog
	err := s.db.QueryRow(`SELECT `+weightCols+` FROM weight_logs WHERE id = ? AND user_id = ?`, id, uid).
		Scan(&w.ID, &w.UserID, &w.Weight, &w.Notes, &w.LoggedAt, &w.LoggedOn, &w.CreatedAt)
	return w, err
}

// UpsertForDay enforces one entry per calendar day: update the day's existing
// entry if present, else insert. req.LoggedAt must already be normalized to UTC.
func (s *WeightStore) UpsertForDay(uid int64, req models.LogWeightRequest, day string) (models.WeightLog, error) {
	// Keyed on the stored day, so "one per day" means one per the day the user filed
	// it under. The previous instant-range version answered the same question through
	// the account zone, which meant a zone change could make two entries collide on a
	// day neither was written for.
	//
	// Atomic check-then-write: without the transaction the connection is released
	// between the SELECT and the write, so two same-day logs could both miss the
	// row and both insert (duplicate day).
	id, err := inTx(s.db, func(tx *sql.Tx) (int64, error) {
		var id int64
		err := tx.QueryRow(
			`SELECT id FROM weight_logs WHERE user_id = ? AND logged_on = ? ORDER BY id DESC LIMIT 1`,
			uid, day,
		).Scan(&id)
		switch err {
		case nil:
			if _, e := tx.Exec(
				`UPDATE weight_logs SET weight = ?, notes = ?, logged_at = ?, logged_on = ? WHERE id = ?`,
				req.Weight, req.Notes, req.LoggedAt, day, id,
			); e != nil {
				return 0, e
			}
		case sql.ErrNoRows:
			res, e := tx.Exec(
				`INSERT INTO weight_logs (user_id, weight, notes, logged_at, logged_on) VALUES (?, ?, ?, ?, ?)`,
				uid, req.Weight, req.Notes, req.LoggedAt, day,
			)
			if e != nil {
				return 0, e
			}
			id, _ = res.LastInsertId()
		default:
			return 0, err
		}
		return id, nil
	})
	if err != nil {
		return models.WeightLog{}, err
	}
	return s.get(id)
}

// Update edits an entry the user owns (sql.ErrNoRows if not theirs), then drops
// any other same-day entry so the day keeps a single entry. req.LoggedAt UTC.
func (s *WeightStore) Update(uid, id int64, req models.LogWeightRequest, day string) (models.WeightLog, error) {
	// Atomic: the row update + the same-day dedup delete must commit together.
	if err := inTxDo(s.db, func(tx *sql.Tx) error {
		res, err := tx.Exec(
			`UPDATE weight_logs SET weight = ?, notes = ?, logged_at = ?, logged_on = ? WHERE id = ? AND user_id = ?`,
			req.Weight, req.Notes, req.LoggedAt, day, id, uid,
		)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return sql.ErrNoRows
		}
		// Same day as the upsert keys on — one entry per the *user's* day. Runs after
		// the update above, so it matches the row's new day, not the one it left.
		_, err = tx.Exec(
			`DELETE FROM weight_logs WHERE user_id = ? AND id != ? AND logged_on = ?`,
			uid, id, day,
		)
		return err
	}); err != nil {
		return models.WeightLog{}, err
	}
	return s.get(id)
}

func (s *WeightStore) Delete(uid, id int64) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM weight_logs WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

func (s *WeightStore) Stats(uid int64) (WeightStats, error) {
	var latest, oldest, minW, maxW, avgW sql.NullFloat64
	var count int
	err := s.db.QueryRow(
		`SELECT
		  (SELECT weight FROM weight_logs WHERE user_id = ? ORDER BY logged_at DESC, id DESC LIMIT 1),
		  (SELECT weight FROM weight_logs WHERE user_id = ? ORDER BY logged_at ASC, id ASC LIMIT 1),
		  MIN(weight), MAX(weight), AVG(weight), COUNT(*)
		 FROM weight_logs WHERE user_id = ?`,
		uid, uid, uid,
	).Scan(&latest, &oldest, &minW, &maxW, &avgW, &count)
	if err != nil {
		return WeightStats{}, err
	}
	stats := WeightStats{
		Latest: latest.Float64, Starting: oldest.Float64,
		Min: minW.Float64, Max: maxW.Float64, Avg: avgW.Float64,
		TotalEntries: count,
	}
	if stats.Change7d, err = s.changeOver(uid, 7); err != nil {
		return WeightStats{}, err
	}
	if stats.Change30d, err = s.changeOver(uid, 30); err != nil {
		return WeightStats{}, err
	}
	return stats, nil
}

// changeOver returns latest minus earliest weight within the last `days` days,
// or 0 with fewer than two entries in the window.
func (s *WeightStore) changeOver(uid int64, days int) (float64, error) {
	cutoff := time.Now().UTC().AddDate(0, 0, -days)
	var latest, earliest sql.NullFloat64
	if err := s.db.QueryRow(
		`SELECT
		  (SELECT weight FROM weight_logs WHERE user_id = ? AND logged_at >= ? ORDER BY logged_at DESC, id DESC LIMIT 1),
		  (SELECT weight FROM weight_logs WHERE user_id = ? AND logged_at >= ? ORDER BY logged_at ASC, id ASC LIMIT 1)`,
		uid, cutoff, uid, cutoff,
	).Scan(&latest, &earliest); err != nil {
		return 0, err
	}
	if !latest.Valid || !earliest.Valid {
		return 0, nil
	}
	return latest.Float64 - earliest.Float64, nil
}

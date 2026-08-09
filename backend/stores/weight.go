package stores

import (
	"database/sql"

	"github.com/Cawlumm/lyftr-backend/models"
)

// WeightStore owns all SQL for the weight_logs entity.
type WeightStore struct{ db *sql.DB }

func NewWeightStore(db *sql.DB) *WeightStore { return &WeightStore{db: db} }

// WeightFilter holds resolved query bounds.
//
// Days, not instants. "Show me last month" is a question about the user's calendar,
// answered against the day each row was filed under — so it consults no zone and the
// answer cannot move later.
type WeightFilter struct {
	Limit, Offset  int
	FromDay, ToDay *string // inclusive day bounds, YYYY-MM-DD
}

// WeightStats is the computed summary for GetWeightStats.
type WeightStats struct {
	Latest, Starting, Min, Max, Avg float64
	TotalEntries                    int
	Change7d, Change30d             float64
}

const weightCols = `id, user_id, weight, notes, logged_at, logged_on, created_at`

// weightDay is the day a row is filed under, for every query that filters, groups or
// orders by day.
//
// logged_on defaults to '' and the backfill leaves a row unset when its stored instant
// is unreadable. Read raw, '' sorts before every real date, so an unset row becomes the
// reported *starting* weight and skews change_30d; and `logged_on >= ?` excludes it, so
// the same row silently vanishes from every windowed query and chart. Falling back to
// the instant's own date keeps such a row in roughly the right place instead of at both
// extremes at once. The fallback reads the UTC day, which is the best available answer
// for a row whose zone could not be established.
const weightDay = `COALESCE(NULLIF(logged_on, ''), substr(logged_at, 1, 10))`

func (s *WeightStore) List(uid int64, f WeightFilter) ([]models.WeightLog, error) {
	q := `SELECT ` + weightCols + ` FROM weight_logs WHERE user_id = ?`
	args := []any{uid}
	if f.FromDay != nil {
		q += ` AND ` + weightDay + ` >= ?`
		args = append(args, *f.FromDay)
	}
	if f.ToDay != nil {
		// Inclusive: the caller asked for a day, not an exclusive bound.
		q += ` AND ` + weightDay + ` <= ?`
		args = append(args, *f.ToDay)
	}
	// Newest day first, and only then newest instant within it. Every reader labels a
	// row with logged_on, so ordering by the instant alone puts the list out of the order
	// it appears to be in: an entry filed for the 10th from UTC+14 is an earlier *moment*
	// than one filed for the 9th from UTC-11, and sorted by instant it renders below it.
	q += ` ORDER BY ` + weightDay + ` DESC, logged_at DESC, id DESC LIMIT ? OFFSET ?`
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
			`SELECT id FROM weight_logs WHERE user_id = ? AND `+weightDay+` = ? ORDER BY id DESC LIMIT 1`,
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
			`DELETE FROM weight_logs WHERE user_id = ? AND id != ? AND `+weightDay+` = ?`,
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

// Stats summarizes a user's weight history. since7d/since30d are the window bounds
// as calendar days, resolved by the controller through the same helper every other
// day query uses.
func (s *WeightStore) Stats(uid int64, since7d, since30d string) (WeightStats, error) {
	var latest, oldest, minW, maxW, avgW sql.NullFloat64
	var count int
	err := s.db.QueryRow(
		// "Latest" means the most recent day weighed, not the most recent instant: those
		// part company once a row's day comes from logged_on. Same ordering as List.
		`SELECT
		  (SELECT weight FROM weight_logs WHERE user_id = ? ORDER BY `+weightDay+` DESC, logged_at DESC, id DESC LIMIT 1),
		  (SELECT weight FROM weight_logs WHERE user_id = ? ORDER BY `+weightDay+` ASC, logged_at ASC, id ASC LIMIT 1),
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
	if stats.Change7d, err = s.changeOver(uid, since7d); err != nil {
		return WeightStats{}, err
	}
	if stats.Change30d, err = s.changeOver(uid, since30d); err != nil {
		return WeightStats{}, err
	}
	return stats, nil
}

// changeOver returns latest minus earliest weight on or after sinceDay, or 0 with
// fewer than two entries in the window.
//
// Bounded by the stored day rather than an instant `now - N*24h`. "The last 7 days"
// is a question about the user's calendar, and answering it in UTC made it the one
// window in the app resolved by a different rule than every other day query.
func (s *WeightStore) changeOver(uid int64, sinceDay string) (float64, error) {
	var latest, earliest sql.NullFloat64
	if err := s.db.QueryRow(
		`SELECT
		  (SELECT weight FROM weight_logs WHERE user_id = ? AND `+weightDay+` >= ? ORDER BY `+weightDay+` DESC, logged_at DESC, id DESC LIMIT 1),
		  (SELECT weight FROM weight_logs WHERE user_id = ? AND `+weightDay+` >= ? ORDER BY `+weightDay+` ASC, logged_at ASC, id ASC LIMIT 1)`,
		uid, sinceDay, uid, sinceDay,
	).Scan(&latest, &earliest); err != nil {
		return 0, err
	}
	if !latest.Valid || !earliest.Valid {
		return 0, nil
	}
	return latest.Float64 - earliest.Float64, nil
}

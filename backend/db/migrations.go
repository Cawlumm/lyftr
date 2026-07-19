package db

import (
	"database/sql"
	"log"
)

func migrate() error {
	_, err := DB.Exec(schema)
	return err
}

// alterMigrations adds columns/tables that postdate the initial schema.
// Each operation is idempotent: it checks before altering.
func alterMigrations() {
	rows, err := DB.Query("PRAGMA table_info(food_logs)")
	if err == nil {
		hasFiber, hasImageURL := false, false
		for rows.Next() {
			var cid int
			var name, typ string
			var notnull int
			var dflt interface{}
			var pk int
			if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
				log.Printf("migrations: scan error: %v", err)
				continue
			}
			if name == "fiber" {
				hasFiber = true
			}
			if name == "image_url" {
				hasImageURL = true
			}
		}
		rows.Close()
		if !hasFiber {
			if _, err := DB.Exec(`ALTER TABLE food_logs ADD COLUMN fiber REAL NOT NULL DEFAULT 0`); err != nil {
				log.Fatalf("alter food_logs add fiber: %v", err)
			}
			log.Println("migration: added food_logs.fiber")
		}
		if !hasImageURL {
			if _, err := DB.Exec(`ALTER TABLE food_logs ADD COLUMN image_url TEXT NOT NULL DEFAULT ''`); err != nil {
				log.Fatalf("alter food_logs add image_url: %v", err)
			}
			log.Println("migration: added food_logs.image_url")
		}
	}

	// Per-exercise rest timer (#33). Existing rows seed to 90s (on); 0 = off.
	ensureColumn("program_exercises", "rest_seconds", `ALTER TABLE program_exercises ADD COLUMN rest_seconds INTEGER NOT NULL DEFAULT 90`)
	ensureColumn("workout_exercises", "rest_seconds", `ALTER TABLE workout_exercises ADD COLUMN rest_seconds INTEGER NOT NULL DEFAULT 90`)

	// Progressive-overload suggestions (#40). Nullable = "no pending suggestion";
	// a suggestion exists when suggested_reps IS NOT NULL (weight+reps staged together).
	// The user reviews + approves these on the routine; approving copies them into target_*.
	ensureColumn("program_sets", "suggested_weight", `ALTER TABLE program_sets ADD COLUMN suggested_weight REAL`)
	ensureColumn("program_sets", "suggested_reps", `ALTER TABLE program_sets ADD COLUMN suggested_reps INTEGER`)
	ensureColumn("program_sets", "suggested_is_pr", `ALTER TABLE program_sets ADD COLUMN suggested_is_pr INTEGER NOT NULL DEFAULT 0`)

	// Program days (#program-days). Nullable FK so SQLite accepts ADD COLUMN on an
	// existing table; every legacy exercise gets a NULL day, then backfill wraps each
	// program's exercises into a single "Day 1" so nothing is orphaned under the new
	// day-grouped loader.
	ensureColumn("program_exercises", "program_day_id", `ALTER TABLE program_exercises ADD COLUMN program_day_id INTEGER REFERENCES program_days(id) ON DELETE CASCADE`)
	if err := backfillProgramDays(DB); err != nil {
		log.Fatalf("backfill program_days: %v", err)
	}
}

// backfillProgramDays wraps every program's dayless exercises into one training day
// named "Day 1". Idempotent: it only touches programs that still have exercises with a
// NULL program_day_id, so a second boot (and a fresh DB with no such rows) is a no-op.
// Kept a standalone, error-returning func (not inlined in alterMigrations) so tests can
// drive it directly against a throwaway DB.
func backfillProgramDays(db *sql.DB) error {
	rows, err := db.Query(`SELECT DISTINCT program_id FROM program_exercises WHERE program_day_id IS NULL`)
	if err != nil {
		return err
	}
	var programIDs []int64
	for rows.Next() {
		var pid int64
		if err := rows.Scan(&pid); err != nil {
			rows.Close()
			return err
		}
		programIDs = append(programIDs, pid)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close() // close before writing on the same (single) connection

	for _, pid := range programIDs {
		res, err := db.Exec(
			`INSERT INTO program_days (program_id, name, order_index, is_rest_day) VALUES (?, 'Day 1', 0, 0)`, pid,
		)
		if err != nil {
			return err
		}
		dayID, err := res.LastInsertId()
		if err != nil {
			return err
		}
		if _, err := db.Exec(
			`UPDATE program_exercises SET program_day_id = ? WHERE program_id = ? AND program_day_id IS NULL`, dayID, pid,
		); err != nil {
			return err
		}
	}
	return nil
}

// ensureColumn adds a column to a table if it's missing — idempotent on every boot.
func ensureColumn(table, column, alterSQL string) {
	rows, err := DB.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		return
	}
	has := false
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull int
		var dflt interface{}
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			continue
		}
		if name == column {
			has = true
		}
	}
	rows.Close()
	if !has {
		if _, err := DB.Exec(alterSQL); err != nil {
			log.Fatalf("alter %s add %s: %v", table, column, err)
		}
		log.Printf("migration: added %s.%s", table, column)
	}
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weight_unit    TEXT    NOT NULL DEFAULT 'lbs',
  calorie_target INTEGER NOT NULL DEFAULT 2000,
  protein_target INTEGER NOT NULL DEFAULT 150,
  carb_target    INTEGER NOT NULL DEFAULT 250,
  fat_target     INTEGER NOT NULL DEFAULT 65
);

CREATE TABLE IF NOT EXISTS exercises (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  muscle_group      TEXT NOT NULL DEFAULT '',
  secondary_muscles TEXT NOT NULL DEFAULT '[]', -- JSON array
  category          TEXT NOT NULL DEFAULT 'strength',
  equipment         TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  image_url         TEXT NOT NULL DEFAULT '',
  video_url         TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);

CREATE TABLE IF NOT EXISTS workouts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  notes      TEXT    NOT NULL DEFAULT '',
  duration   INTEGER NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id  INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  order_index INTEGER NOT NULL DEFAULT 0,
  notes       TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number          INTEGER NOT NULL DEFAULT 1,
  reps                INTEGER NOT NULL DEFAULT 0,
  weight              REAL    NOT NULL DEFAULT 0,
  duration            INTEGER NOT NULL DEFAULT 0,
  distance            REAL    NOT NULL DEFAULT 0,
  rpe                 REAL    NOT NULL DEFAULT 0,
  is_warmup           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS weight_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight     REAL    NOT NULL,
  notes      TEXT    NOT NULL DEFAULT '',
  logged_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user ON weight_logs(user_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS food_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  meal         TEXT    NOT NULL DEFAULT 'snacks',
  calories     REAL    NOT NULL DEFAULT 0,
  protein      REAL    NOT NULL DEFAULT 0,
  carbs        REAL    NOT NULL DEFAULT 0,
  fat          REAL    NOT NULL DEFAULT 0,
  servings     REAL    NOT NULL DEFAULT 1,
  serving_size TEXT    NOT NULL DEFAULT '',
  barcode      TEXT    NOT NULL DEFAULT '',
  logged_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_food_logs_user ON food_logs(user_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS saved_foods (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  brand        TEXT    NOT NULL DEFAULT '',
  calories     REAL    NOT NULL DEFAULT 0,
  protein      REAL    NOT NULL DEFAULT 0,
  carbs        REAL    NOT NULL DEFAULT 0,
  fat          REAL    NOT NULL DEFAULT 0,
  fiber        REAL    NOT NULL DEFAULT 0,
  serving_size TEXT    NOT NULL DEFAULT '',
  barcode      TEXT    NOT NULL DEFAULT '',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_foods_user ON saved_foods(user_id);

CREATE TABLE IF NOT EXISTS active_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS programs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  notes      TEXT    NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_programs_user ON programs(user_id);

CREATE TABLE IF NOT EXISTS program_days (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_rest_day INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_program_days_program ON program_days(program_id, order_index);

CREATE TABLE IF NOT EXISTS program_exercises (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id     INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  program_day_id INTEGER REFERENCES program_days(id) ON DELETE CASCADE,
  exercise_id    INTEGER NOT NULL REFERENCES exercises(id),
  order_index    INTEGER NOT NULL DEFAULT 0,
  notes          TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS program_sets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  program_exercise_id INTEGER NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
  set_number          INTEGER NOT NULL DEFAULT 1,
  target_reps         INTEGER NOT NULL DEFAULT 0,
  target_weight       REAL    NOT NULL DEFAULT 0
);
`

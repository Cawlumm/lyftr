package db

import "log"

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

	multiDayProgramsMigration()

	// Lets a logged workout be attributed back to the routine it came from, so a
	// program's cycle position (Program.CurrentDayIndex) can be computed as a simple
	// COUNT(*) MOD len(days) — see ProgramStore.currentDayIndex. Best-effort/no FK:
	// deleting a program must never take workout history down with it.
	ensureColumn("workouts", "program_id", `ALTER TABLE workouts ADD COLUMN program_id INTEGER`)
	if _, err := DB.Exec(`CREATE INDEX IF NOT EXISTS idx_workouts_program ON workouts(program_id)`); err != nil {
		log.Fatalf("create idx_workouts_program: %v", err)
	}
}

// multiDayProgramsMigration adds the program_days table + program_exercises'
// program_day_id FK (multi-day routines w/ rest days). Non-destructive: every
// program that predates this migration gets wrapped in exactly one auto-created
// workout Day (order_index 0) that takes over its existing program_exercises rows —
// no data loss, and the routine keeps behaving exactly as a single-session template
// until the user edits it into multiple days.
func multiDayProgramsMigration() {
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS program_days (
		  id          INTEGER PRIMARY KEY AUTOINCREMENT,
		  program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
		  order_index INTEGER NOT NULL DEFAULT 0,
		  is_rest_day INTEGER NOT NULL DEFAULT 0,
		  name        TEXT    NOT NULL DEFAULT ''
		)`); err != nil {
		log.Fatalf("create program_days: %v", err)
	}
	if _, err := DB.Exec(`CREATE INDEX IF NOT EXISTS idx_program_days_program ON program_days(program_id, order_index)`); err != nil {
		log.Fatalf("create idx_program_days_program: %v", err)
	}

	ensureColumn("program_exercises", "program_day_id",
		`ALTER TABLE program_exercises ADD COLUMN program_day_id INTEGER REFERENCES program_days(id) ON DELETE CASCADE`)
	if _, err := DB.Exec(`CREATE INDEX IF NOT EXISTS idx_program_exercises_day ON program_exercises(program_day_id)`); err != nil {
		log.Fatalf("create idx_program_exercises_day: %v", err)
	}

	// Backfill: every pre-existing program (whether or not it has any exercises yet —
	// an empty routine was a valid state under the old flat model) gets a single
	// wrapper Day. Idempotent — a program only ever lacks a Day once.
	rows, err := DB.Query(`
		SELECT p.id
		FROM programs p
		WHERE NOT EXISTS (SELECT 1 FROM program_days pd WHERE pd.program_id = p.id)`)
	if err != nil {
		log.Fatalf("multiDayProgramsMigration: query orphaned programs: %v", err)
	}
	var programIDs []int64
	for rows.Next() {
		var pid int64
		if err := rows.Scan(&pid); err != nil {
			rows.Close()
			log.Fatalf("multiDayProgramsMigration: scan: %v", err)
		}
		programIDs = append(programIDs, pid)
	}
	rows.Close()

	for _, pid := range programIDs {
		res, err := DB.Exec(`INSERT INTO program_days (program_id, order_index, is_rest_day, name) VALUES (?, 0, 0, '')`, pid)
		if err != nil {
			log.Fatalf("multiDayProgramsMigration: insert wrapper day for program %d: %v", pid, err)
		}
		dayID, err := res.LastInsertId()
		if err != nil {
			log.Fatalf("multiDayProgramsMigration: wrapper day id for program %d: %v", pid, err)
		}
		if _, err := DB.Exec(`UPDATE program_exercises SET program_day_id = ? WHERE program_id = ? AND program_day_id IS NULL`, dayID, pid); err != nil {
			log.Fatalf("multiDayProgramsMigration: backfill program_day_id for program %d: %v", pid, err)
		}
		log.Printf("migration: wrapped program %d in a single Day", pid)
	}
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

CREATE TABLE IF NOT EXISTS program_exercises (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  order_index INTEGER NOT NULL DEFAULT 0,
  notes       TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS program_sets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  program_exercise_id INTEGER NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
  set_number          INTEGER NOT NULL DEFAULT 1,
  target_reps         INTEGER NOT NULL DEFAULT 0,
  target_weight       REAL    NOT NULL DEFAULT 0
);
`

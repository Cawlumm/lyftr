package db

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	// The backfill resolves stored zones, and the production image (alpine) ships no
	// /usr/share/zoneinfo. controllers blank-imports this too; both are needed, since
	// relying on another package's import would break silently if that one moved.
	_ "time/tzdata"
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

	multiDayProgramsMigration()

	// Lets a logged workout be attributed back to the routine it came from, so a
	// program's cycle position (Program.CurrentDayIndex) can be derived from what was
	// actually logged — see ProgramStore.currentDayIndex. Best-effort/no FK:
	// deleting a program must never take workout history down with it.
	ensureColumn("workouts", "program_id", `ALTER TABLE workouts ADD COLUMN program_id INTEGER`)
	ensureIndex("idx_workouts_program", `CREATE INDEX IF NOT EXISTS idx_workouts_program ON workouts(program_id)`)

	// Bumped whenever the account's credentials change, and carried in every token as
	// the "ver" claim. Refresh compares the two and refuses a token minted before the
	// bump, which is the only way a stateless JWT can be revoked: without it a stolen
	// refresh token outlives a password change by its full 30-day life, defeating the
	// entire point of changing the password. Existing rows start at 1, matching the
	// tokens already in the wild, so nobody is signed out by the upgrade itself.
	ensureColumn("users", "token_version", `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1`)

	// The zone the server buckets this user's day-scoped data in. Defaults to UTC,
	// which is exactly the behaviour every existing row was written under, so this
	// column changes nothing until a client reports a real zone.
	ensureColumn("user_settings", "timezone", `ALTER TABLE user_settings ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC'`)

	workoutProgramDayMigration()

	normalizeWorkoutStartedAt()
	normalizeFoodLoggedAt()
	normalizeWeightLoggedAt()

	// The day a diary entry belongs to, and the offset a workout started at, stored
	// ON THE ROW instead of derived from the account's current zone at read time.
	//
	// This is the split Fitbit and wger arrived at independently. Fitbit's food log
	// entry is `logDate: "2019-03-21"` with no time component at all, and its weight
	// entry carries separate local `date` and `time`; its *activity* keeps a real
	// instant with the offset inline (`2019-01-03T12:08:29.000-08:00`). wger stores
	// WorkoutSession.date as a plain DateField while its log rows stay timestamps.
	//
	// Why a date for the diary but an offset for the workout, rather than one shape
	// for both: a back-dated meal has no real instant — we invent local noon for it —
	// so an offset on that invented instant would be invented too. The date is the
	// honest primitive there. A workout genuinely happened at a moment, and duration
	// and ordering depend on that moment, so it keeps the instant and gains the
	// offset that makes its local day recoverable forever.
	//
	// These run AFTER the normalize* calls above: the backfill derives days from
	// logged_at/started_at, so those must already be UTC or the derived day inherits
	// the stale zone.
	ensureColumn("food_logs", "logged_on", `ALTER TABLE food_logs ADD COLUMN logged_on TEXT NOT NULL DEFAULT ''`)
	ensureColumn("weight_logs", "logged_on", `ALTER TABLE weight_logs ADD COLUMN logged_on TEXT NOT NULL DEFAULT ''`)
	ensureColumn("workouts", "tz_offset_minutes", `ALTER TABLE workouts ADD COLUMN tz_offset_minutes INTEGER`)
	ensureIndex("idx_food_logs_user_day", `CREATE INDEX IF NOT EXISTS idx_food_logs_user_day ON food_logs(user_id, logged_on)`)
	ensureIndex("idx_weight_logs_user_day", `CREATE INDEX IF NOT EXISTS idx_weight_logs_user_day ON weight_logs(user_id, logged_on)`)
	backfillLocalDays()

	// Identity for the open-exercise-db row this exercise mirrors.
	//
	// Lyftr keeps its own INTEGER id as the primary key and does not adopt oedb's
	// UUID as one: workout_exercises and program_exercises FK into exercises(id)
	// with no cascade, so that key is load-bearing in user data that predates oedb
	// entirely. oedb_id is the join key upward, not the identity downward.
	//
	// Nullable on purpose. A row with oedb_id IS NULL is one oedb does not know
	// about — a pre-migration row whose name did not match, or (later) a
	// user-created exercise not yet contributed. SQLite treats NULLs as distinct in
	// a UNIQUE index, so any number of them coexist while still forbidding two rows
	// claiming the same upstream exercise.
	ensureColumn("exercises", "oedb_id", `ALTER TABLE exercises ADD COLUMN oedb_id TEXT`)
	ensureColumn("exercises", "slug", `ALTER TABLE exercises ADD COLUMN slug TEXT`)
	ensureIndex("idx_exercises_oedb_id", `CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_oedb_id ON exercises(oedb_id)`)

	normalizeExerciseTaxonomy()

	// The product a diary entry was, so it survives into Recent and can be matched
	// against Favorites. Entries written before this default to '' — the same value the
	// unbranded case uses, which is exactly how they already compared.
	ensureColumn("food_logs", "brand", `ALTER TABLE food_logs ADD COLUMN brand TEXT NOT NULL DEFAULT ''`)

	// Favorites is a bookmark list: starring a food saves it *unscaled* — the servings
	// stepper scales at log time instead — so two rows with the same user/name/brand
	// carry no information the first one didn't. They are the same star pressed twice.
	//
	// Both the order and the condition matter. ensureIndex is log.Fatal on failure and
	// CREATE UNIQUE INDEX fails against a table that still holds duplicates, so creating
	// it unconditionally would refuse to boot exactly the installs that have the bug.
	if dedupeSavedFoods() && trimSavedFoods() {
		ensureIndex("idx_saved_foods_unique",
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_foods_unique ON saved_foods(user_id, name, brand)`)
	}
}

// sqlWhitespace is the character set TRIM() strips, chosen to match what the handlers do
// with strings.TrimSpace.
//
// SQLite's one-argument TRIM removes spaces and nothing else, so TRIM(char(9)||'Oats') is
// still tab-Oats. Anything this set misses that TrimSpace catches is worse than untidy: the
// migration would leave the row as it found it while every later write strips the padding,
// producing the pair of identical-looking favourites the migration exists to remove.
//
// char(160) is a non-breaking space and char(133) a NEL — both are unicode.IsSpace, so Go
// strips them, and both turn up in product names from Open Food Facts. Verified:
//
//	TRIM(char(160)||'Oats'||char(160), ' '||char(9)||char(10)||char(13))            -> "\xa0Oats\xa0"
//	TRIM(char(160)||'Oats'||char(160), ' '||…||char(160)||char(133))                -> "Oats"
const sqlWhitespace = `' ' || char(9) || char(10) || char(13) || char(160) || char(133)`

// trimSavedFoods normalises rows written before the handlers started trimming, so stored
// data matches what the app now produces and what the clients compare against.
//
// Reports whether saved_foods is safe to index — same contract as dedupeSavedFoods, and
// never a reason to fail the boot.
//
// The order is the whole trick. Trimming first collides with the unique index the moment
// two rows trim to the same key:
//
//	UPDATE first -> UNIQUE constraint failed: saved_foods.user_id, name, brand
//	DELETE first -> fine
//
// So collapse on the *trimmed* key while the rows are still untrimmed, then rewrite the
// survivors. Keeps the earliest id, the same rule dedupeSavedFoods documents.
func trimSavedFoods() bool {
	done, err := hasMigrationFlag("trim_saved_foods")
	if err != nil {
		log.Printf("migrations: trim saved_foods flag: %v (skipping the unique index this boot)", err)
		return false
	}
	if done {
		return true
	}

	// A name that is nothing but whitespace renders as a blank row. It was never a
	// favourite anyone chose; the handlers now reject it outright.
	if _, err := DB.Exec(`DELETE FROM saved_foods WHERE TRIM(name, ` + sqlWhitespace + `) = ''`); err != nil {
		log.Printf("migrations: drop blank saved_foods: %v (skipping the unique index this boot)", err)
		return false
	}

	if _, err := DB.Exec(`
		DELETE FROM saved_foods
		WHERE id NOT IN (
			SELECT MIN(id) FROM saved_foods
			GROUP BY user_id, TRIM(name, ` + sqlWhitespace + `), TRIM(brand, ` + sqlWhitespace + `)
		)`); err != nil {
		log.Printf("migrations: dedupe saved_foods on the trimmed key: %v (skipping the unique index this boot)", err)
		return false
	}

	res, err := DB.Exec(`
		UPDATE saved_foods
		SET name = TRIM(name, ` + sqlWhitespace + `), brand = TRIM(brand, ` + sqlWhitespace + `)
		WHERE name <> TRIM(name, ` + sqlWhitespace + `) OR brand <> TRIM(brand, ` + sqlWhitespace + `)`)
	if err != nil {
		log.Printf("migrations: trim saved_foods: %v (skipping the unique index this boot)", err)
		return false
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("migration: trimmed %d saved_foods row(s)", n)
	}

	// food_logs feeds the Recent tab, which matches against Favorites by name and brand.
	// No unique index here, so a plain rewrite — but leaving it untrimmed would keep old
	// entries failing to match the favourites they came from.
	if res, err := DB.Exec(`
		UPDATE food_logs
		SET name = TRIM(name, ` + sqlWhitespace + `), brand = TRIM(brand, ` + sqlWhitespace + `)
		WHERE name <> TRIM(name, ` + sqlWhitespace + `) OR brand <> TRIM(brand, ` + sqlWhitespace + `)`); err != nil {
		log.Printf("migrations: trim food_logs: %v (skipping the unique index this boot)", err)
		return false
	} else if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("migration: trimmed %d food_logs row(s)", n)
	}

	setMigrationFlag("trim_saved_foods")
	return true
}

// dedupeSavedFoods collapses duplicate stars, keeping the lowest id in each
// (user_id, name, brand) group — the one starred first.
//
// Reports whether saved_foods is known to be free of duplicates, i.e. whether the
// unique index may safely be created. False means "not now", never a reason to fail
// the boot.
//
// Deleting rows in a migration deserves an argument. Nothing can edit a saved food
// (there is no PATCH), and starring copies whichever search result was on screen, so
// two rows sharing a user, name and brand differ at most in macros sourced from two
// search hits for the same product. Neither is more authoritative, both render
// identically in the list, and either one logs the same way. Keeping the earliest is
// arbitrary but stable, and the row is one tap to recreate.
func dedupeSavedFoods() bool {
	done, err := hasMigrationFlag("dedupe_saved_foods")
	if err != nil {
		log.Printf("migrations: dedupe saved_foods flag: %v (skipping the unique index this boot)", err)
		return false
	}
	if done {
		return true
	}
	res, err := DB.Exec(`
		DELETE FROM saved_foods
		WHERE id NOT IN (
			SELECT MIN(id) FROM saved_foods GROUP BY user_id, name, brand
		)`)
	if err != nil {
		// Leave the flag unset so the next boot retries, and tell the caller not to
		// create the index — CREATE UNIQUE INDEX would fail against the duplicates still
		// there, and ensureIndex is log.Fatal, so a transient error on this one DELETE
		// would stop the server starting. Running without the index is the far smaller
		// problem: the clients still check before starring, so the worst case is the
		// duplicate this migration exists to remove. Note the server-side guard genuinely
		// is absent there — with no index there is no unique violation for CreateSaved to
		// resolve, so it takes the plain insert path and answers 201.
		log.Printf("migrations: dedupe saved_foods: %v (skipping the unique index this boot)", err)
		return false
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("migration: removed %d duplicate saved_foods row(s)", n)
	}
	setMigrationFlag("dedupe_saved_foods")
	return true
}

// normalizeExerciseTaxonomy rewrites the eight taxonomy values Lyftr inherited
// verbatim from free-exercise-db into the slug forms open-exercise-db serves.
//
// Lyftr's seeder copied upstream's display strings ("body only", "lower back")
// straight into the column. oedb normalizes the same vocabulary to slugs
// ("body-only", "lower-back"). Once exercises arrive from oedb, a database left
// unconverted holds both spellings of the same concept, and every equipment
// filter silently returns half its rows.
//
// Safe to rewrite in place: no user-owned row stores a taxonomy string. Workouts
// and programs reference exercises by id, so this touches presentation values
// only. The set is closed and was verified against both corpora — these are the
// only values that differ, in either direction.
func normalizeExerciseTaxonomy() {
	done, err := hasMigrationFlag("normalize_exercise_taxonomy")
	if err != nil || done {
		return
	}

	// secondary_muscles is a JSON array in a TEXT column, so it is rewritten with
	// string replacement over the encoded form rather than by decoding each row.
	// The quotes are part of the match: they pin the replacement to a whole JSON
	// string element, so a value that merely contains another as a substring cannot
	// be corrupted from the middle.
	stmts := []struct {
		sql  string
		args []any
	}{
		{`UPDATE exercises SET equipment = ? WHERE equipment = ?`, []any{"body-only", "body only"}},
		{`UPDATE exercises SET equipment = ? WHERE equipment = ?`, []any{"e-z-curl-bar", "e-z curl bar"}},
		{`UPDATE exercises SET equipment = ? WHERE equipment = ?`, []any{"exercise-ball", "exercise ball"}},
		{`UPDATE exercises SET equipment = ? WHERE equipment = ?`, []any{"foam-roll", "foam roll"}},
		{`UPDATE exercises SET equipment = ? WHERE equipment = ?`, []any{"medicine-ball", "medicine ball"}},
		// oedb has no empty equipment: upstream's blank becomes the explicit "none".
		{`UPDATE exercises SET equipment = ? WHERE equipment = ?`, []any{"none", ""}},
		{`UPDATE exercises SET category = ? WHERE category = ?`, []any{"olympic-weightlifting", "olympic weightlifting"}},
		{`UPDATE exercises SET muscle_group = ? WHERE muscle_group = ?`, []any{"lower-back", "lower back"}},
		{`UPDATE exercises SET muscle_group = ? WHERE muscle_group = ?`, []any{"middle-back", "middle back"}},
		{`UPDATE exercises SET secondary_muscles = replace(secondary_muscles, ?, ?)`, []any{`"lower back"`, `"lower-back"`}},
		{`UPDATE exercises SET secondary_muscles = replace(secondary_muscles, ?, ?)`, []any{`"middle back"`, `"middle-back"`}},
	}

	tx, err := DB.Begin()
	if err != nil {
		log.Printf("migration: normalize exercise taxonomy: begin: %v", err)
		return
	}
	changed := int64(0)
	for _, s := range stmts {
		res, err := tx.Exec(s.sql, s.args...)
		if err != nil {
			tx.Rollback()
			log.Printf("migration: normalize exercise taxonomy: %v", err)
			return
		}
		if n, err := res.RowsAffected(); err == nil {
			changed += n
		}
	}
	if err := tx.Commit(); err != nil {
		log.Printf("migration: normalize exercise taxonomy: commit: %v", err)
		return
	}
	setMigrationFlag("normalize_exercise_taxonomy")
	if changed > 0 {
		log.Printf("migration: normalized %d exercise taxonomy values to oedb slugs", changed)
	}
}

// backfillLocalDays fills the stored day/offset for rows written before those
// columns existed.
//
// Deliberately behaviour-preserving: it derives each row's day with exactly the rule
// the read path used before this change — the instant, resolved in that user's stored
// zone. So upgrading an existing server moves nothing. What changes is that the answer
// is now frozen on the row instead of recomputed against a zone that can change.
//
// That also means the backfill inherits whatever the account zone says today. For a
// user who already travelled before upgrading, their old entries are pinned to the
// day their *current* zone implies, which may not be the day they lived through. That
// is not recoverable — the write-time zone was never stored, which is the whole reason
// for this change — and it is strictly no worse than the derive-every-time behaviour
// it replaces.
func backfillLocalDays() {
	done, err := hasMigrationFlag("backfill_local_days")
	if err != nil {
		log.Printf("backfillLocalDays: check flag: %v (skipping this boot)", err)
		return
	}
	if done {
		return
	}
	locs := map[string]*time.Location{}
	loadLoc := func(name string) *time.Location {
		if l, ok := locs[name]; ok {
			return l
		}
		l, err := time.LoadLocation(name)
		if err != nil {
			log.Printf("backfillLocalDays: unknown zone %q, using UTC for those rows", name)
			l = time.UTC
		}
		locs[name] = l
		return l
	}

	for _, t := range []struct{ table, column string }{
		{"food_logs", "logged_at"},
		{"weight_logs", "logged_at"},
	} {
		if err := backfillDayColumn(t.table, t.column, loadLoc); err != nil {
			log.Printf("backfillLocalDays(%s): %v (skipping this boot, will retry)", t.table, err)
			return
		}
	}
	if err := backfillWorkoutOffsets(loadLoc); err != nil {
		log.Printf("backfillLocalDays(workouts): %v (skipping this boot, will retry)", err)
		return
	}
	setMigrationFlag("backfill_local_days")
}

// scanStoredTime reads a timestamp column whatever shape the driver hands back, and
// reports whether it could be read at all.
//
// Shared by both backfills on purpose. They had the same bug and only one was fixed:
// scanning straight into time.Time makes a single legacy value the driver cannot parse
// fail the scan, and since the caller returns on error, one unreadable row abandoned the
// rest of the upgrade and never set the completion flag — so every later boot retried and
// failed identically. Keeping the read in one place is what stops that fix drifting apart
// again.
func scanStoredTime(v any) (time.Time, bool) {
	switch tv := v.(type) {
	case time.Time:
		return tv, true
	case string:
		return parseStoredTime(tv)
	case []byte:
		return parseStoredTime(string(tv))
	default:
		return time.Time{}, false
	}
}

// backfillDayColumn sets table.logged_on from table.<column> resolved in the owning
// user's zone. Users with no settings row fall back to UTC, matching userLocation.
func backfillDayColumn(table, column string, loadLoc func(string) *time.Location) error {
	rows, err := DB.Query(fmt.Sprintf(`
		SELECT t.id, t.%[2]s, COALESCE(s.timezone, 'UTC')
		FROM %[1]s t LEFT JOIN user_settings s ON s.user_id = t.user_id
		WHERE t.logged_on = ''`, table, column))
	if err != nil {
		return err
	}
	type fix struct {
		id  int64
		day string
	}
	var fixes []fix
	for rows.Next() {
		var id int64
		var v any
		var zone string
		if err := rows.Scan(&id, &v, &zone); err != nil {
			rows.Close()
			return err
		}
		at, ok := scanStoredTime(v)
		if !ok {
			log.Printf("backfillDayColumn(%s.%s): row %d: unreadable value %v left unset", table, column, id, v)
			continue
		}
		fixes = append(fixes, fix{id, at.In(loadLoc(zone)).Format("2006-01-02")})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(fixes) == 0 {
		return nil
	}
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(fmt.Sprintf(`UPDATE %s SET logged_on = ? WHERE id = ?`, table))
	if err != nil {
		tx.Rollback()
		return err
	}
	for _, f := range fixes {
		if _, err := stmt.Exec(f.day, f.id); err != nil {
			stmt.Close()
			tx.Rollback()
			return err
		}
	}
	stmt.Close()
	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("migration: backfilled %s.logged_on for %d rows", table, len(fixes))
	return nil
}

// backfillWorkoutOffsets sets workouts.tz_offset_minutes from the owning user's zone
// at that workout's instant — .Zone() rather than a fixed offset, so a workout logged
// in July gets the summer offset and one logged in January gets the winter one.
func backfillWorkoutOffsets(loadLoc func(string) *time.Location) error {
	rows, err := DB.Query(`
		SELECT w.id, w.started_at, COALESCE(s.timezone, 'UTC')
		FROM workouts w LEFT JOIN user_settings s ON s.user_id = w.user_id
		WHERE w.tz_offset_minutes IS NULL`)
	if err != nil {
		return err
	}
	type fix struct {
		id      int64
		minutes int
	}
	var fixes []fix
	for rows.Next() {
		var id int64
		var v any
		var zone string
		if err := rows.Scan(&id, &v, &zone); err != nil {
			rows.Close()
			return err
		}
		at, ok := scanStoredTime(v)
		if !ok {
			log.Printf("backfillWorkoutOffsets: row %d: unreadable started_at %v left unset", id, v)
			continue
		}
		_, offsetSeconds := at.In(loadLoc(zone)).Zone()
		fixes = append(fixes, fix{id, offsetSeconds / 60})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(fixes) == 0 {
		return nil
	}
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`UPDATE workouts SET tz_offset_minutes = ? WHERE id = ?`)
	if err != nil {
		tx.Rollback()
		return err
	}
	for _, f := range fixes {
		if _, err := stmt.Exec(f.minutes, f.id); err != nil {
			stmt.Close()
			tx.Rollback()
			return err
		}
	}
	stmt.Close()
	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("migration: backfilled workouts.tz_offset_minutes for %d rows", len(fixes))
	return nil
}

// normalizeWorkoutStartedAt rewrites any workouts.started_at stored with a non-UTC
// zone offset to its UTC equivalent. The due-day tracker compares started_at as
// stored TEXT (ProgramStore.currentDayIndex orders by it and compares rows against
// the anchor lexicographically), and the driver's default write format embeds the
// zone — so a row written before the controllers' write-side UTC normalization
// (e.g. a third-party API client sending '+08:00') compares by wall-clock text, not
// instant, and could permanently win or lose the most-recent-anchor lookup against
// newer UTC rows.
func normalizeWorkoutStartedAt() {
	normalizeUTCTimestamps("normalize_workout_started_at", "workouts", "started_at")
}

func normalizeFoodLoggedAt() {
	normalizeUTCTimestamps("normalize_food_logged_at", "food_logs", "logged_at")
}

// weight_logs was the one day-scoped table left without this pass, which is exactly
// where an unrepaired non-UTC value could sit and stall the day backfill.
func normalizeWeightLoggedAt() {
	normalizeUTCTimestamps("normalize_weight_logged_at", "weight_logs", "logged_at")
}

// normalizeUTCTimestamps rewrites any table.column value stored with a non-UTC zone
// offset to its UTC equivalent. Normalizing also repairs reads: a fixed-offset zone
// with no name is stored as its offset twice ('… +0800 +0800'), which the driver
// can't parse back into a time.Time at all. The WHERE matches only offset-bearing
// non-UTC rows, so this is idempotent and a no-op on every boot after the first;
// a row whose text can't be parsed is logged and left as-is (retried next boot).
//
// The WHERE's leading-wildcard LIKEs can't use an index, so once a boot finds zero
// matching rows (every offending row fixed — new rows are already written UTC by
// the controllers' write-side normalization), a migration_flags row records that so
// every later boot skips the scan entirely instead of re-running it forever. The
// flag is deliberately keyed off the MATCH count, not len(fixes): a boot can match
// rows yet fix none of them (all unparseable), and flagging done there would break
// the retry-next-boot this function promises above.
func normalizeUTCTimestamps(flag, table, column string) {
	done, err := hasMigrationFlag(flag)
	if err != nil {
		log.Printf("normalizeUTCTimestamps(%s.%s): check flag: %v (skipping this boot)", table, column, err)
		return
	}
	if done {
		return
	}
	rows, err := DB.Query(fmt.Sprintf(`
		SELECT id, %[2]s FROM %[1]s
		WHERE (%[2]s LIKE '%% +%%' OR %[2]s LIKE '%% -%%')
		  AND %[2]s NOT LIKE '%%+0000%%'`, table, column))
	if err != nil {
		log.Printf("normalizeUTCTimestamps(%s.%s): query: %v (skipping this boot)", table, column, err)
		return
	}
	type fix struct {
		id int64
		t  time.Time
	}
	var fixes []fix
	matched := 0
	for rows.Next() {
		matched++
		var id int64
		var v any
		if err := rows.Scan(&id, &v); err != nil {
			rows.Close()
			log.Printf("normalizeUTCTimestamps(%s.%s): scan: %v (skipping this boot)", table, column, err)
			return
		}
		switch tv := v.(type) {
		case time.Time:
			fixes = append(fixes, fix{id, tv.UTC()})
		case string:
			if t, ok := parseStoredTime(tv); ok {
				fixes = append(fixes, fix{id, t.UTC()})
			} else {
				log.Printf("normalizeUTCTimestamps(%s.%s): row %d: unparseable value %q left as-is", table, column, id, tv)
			}
		default:
			log.Printf("normalizeUTCTimestamps(%s.%s): row %d: unexpected type %T left as-is", table, column, id, v)
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		log.Printf("normalizeUTCTimestamps(%s.%s): rows: %v (skipping this boot)", table, column, err)
		return
	}
	rows.Close() // release the process's only connection BEFORE the updates (SetMaxOpenConns(1))

	for _, f := range fixes {
		if _, err := DB.Exec(fmt.Sprintf(`UPDATE %s SET %s = ? WHERE id = ?`, table, column), f.t, f.id); err != nil {
			log.Fatalf("normalizeUTCTimestamps(%s.%s): update row %d: %v", table, column, f.id, err)
		}
	}
	if len(fixes) > 0 {
		log.Printf("migration: normalized %d non-UTC %s.%s row(s) to UTC", len(fixes), table, column)
	}
	if matched == 0 {
		setMigrationFlag(flag)
	}
}

// parseStoredTime parses a stored started_at the driver itself couldn't convert to
// a time.Time. The driver's default write format is time.Time.String(); a fixed-
// offset zone with no name (what encoding/json produces for a '+08:00' timestamp)
// renders the offset twice ('2026-07-19 02:00:00 +0800 +0800'), which the MST
// layout element can't match — drop the trailing zone-name token and parse
// offset-only. Tried before that: the offset-only layout against the untouched
// string, for rows that are already plain "date time -0700" with no name to
// strip — chopping the last token there would eat the offset itself and always
// fail.
func parseStoredTime(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if t, err := time.Parse("2006-01-02 15:04:05.999999999 -0700 MST", s); err == nil {
		return t, true
	}
	if t, err := time.Parse("2006-01-02 15:04:05.999999999 -0700", s); err == nil {
		return t, true
	}
	if i := strings.LastIndexByte(s, ' '); i > 0 {
		if t, err := time.Parse("2006-01-02 15:04:05.999999999 -0700", s[:i]); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// workoutProgramDayMigration adds workouts.program_day_id: WHICH specific program Day
// a workout was logged under, so the due-day tracker follows what was actually logged
// instead of a blind workout count (which desyncs when a day is repeated or logged out
// of order). ON DELETE SET NULL, not CASCADE — a workout's history must survive its
// day later being deleted/edited; only the day linkage drops.
//
// The backfill runs ONLY when the column is first added: pre-existing program workouts
// are attributed to their program's first workout day (lowest order_index, non-rest).
// That's a best-effort default for the transitional window between the multi-day
// migration above and this one — not expected to be exact for every historical row.
// It must never re-run on a later boot: a NULL program_day_id can then also mean "its
// day was deleted" (the SET NULL path), which a re-run would wrongly overwrite.
func workoutProgramDayMigration() {
	has, err := hasColumn("workouts", "program_day_id")
	if err != nil {
		// Unknown schema state: skip entirely (retried next boot) rather than risk a
		// duplicate-column ALTER or, far worse, re-running the never-re-run backfill.
		log.Printf("workoutProgramDayMigration: check column: %v (skipping this boot)", err)
		return
	}
	if !has {
		// ALTER + backfill must land atomically (SQLite DDL is transactional): if the
		// backfill died after a committed ALTER, every later boot would see the column
		// and skip the backfill forever — the transitional rows would stay NULL with
		// no recovery path, since re-running is forbidden per above.
		tx, err := DB.Begin()
		if err != nil {
			log.Fatalf("workoutProgramDayMigration: begin: %v", err)
		}
		if _, err := tx.Exec(`ALTER TABLE workouts ADD COLUMN program_day_id INTEGER REFERENCES program_days(id) ON DELETE SET NULL`); err != nil {
			tx.Rollback()
			log.Fatalf("alter workouts add program_day_id: %v", err)
		}
		if _, err := tx.Exec(`
			UPDATE workouts SET program_day_id = (
			  SELECT pd.id FROM program_days pd
			  WHERE pd.program_id = workouts.program_id AND pd.is_rest_day = 0
			  ORDER BY pd.order_index LIMIT 1
			)
			WHERE program_id IS NOT NULL AND program_day_id IS NULL`); err != nil {
			tx.Rollback()
			log.Fatalf("backfill workouts.program_day_id: %v", err)
		}
		if err := tx.Commit(); err != nil {
			log.Fatalf("workoutProgramDayMigration: commit: %v", err)
		}
		log.Println("migration: added workouts.program_day_id (+ first-workout-day backfill)")
	}
	ensureIndex("idx_workouts_program_day", `CREATE INDEX IF NOT EXISTS idx_workouts_program_day ON workouts(program_day_id)`)

	// program_day_dropped = 1 marks a workout whose day linkage was deliberately
	// removed by a routine edit deleting that day (ProgramStore.Update sets it
	// alongside the NULL). It splits the two meanings of a NULL program_day_id the
	// due-day tracker must treat differently: an old-client day-less log advances
	// the tracker count-based, but deletion residue must not — deleting a day with
	// a long logged history would otherwise swing the due day by the parity of an
	// arbitrary lifetime count (see ProgramStore.currentDayIndex). NULL rows that
	// predate this column can't be told apart retroactively and stay count-based;
	// acceptable for the transitional window between the column-add above and this.
	ensureColumn("workouts", "program_day_dropped", `ALTER TABLE workouts ADD COLUMN program_day_dropped INTEGER NOT NULL DEFAULT 0`)
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
	ensureIndex("idx_program_days_program", `CREATE INDEX IF NOT EXISTS idx_program_days_program ON program_days(program_id, order_index)`)

	ensureColumn("program_exercises", "program_day_id",
		`ALTER TABLE program_exercises ADD COLUMN program_day_id INTEGER REFERENCES program_days(id) ON DELETE CASCADE`)
	ensureIndex("idx_program_exercises_day", `CREATE INDEX IF NOT EXISTS idx_program_exercises_day ON program_exercises(program_day_id)`)

	// Backfill: every pre-existing program (whether or not it has any exercises yet —
	// an empty routine was a valid state under the old flat model) gets a single
	// wrapper Day. Idempotent — a program only ever lacks a Day once. Gated behind a
	// migration_flags row (same pattern as normalizeWorkoutStartedAt) once a boot
	// finds zero orphaned programs, so this anti-join isn't rescanning the whole
	// programs table on every single startup forever — every program gets a Day
	// right here or at Create time from now on, so "zero orphans" is permanent.
	done, err := hasMigrationFlag("multi_day_programs_backfilled")
	if err != nil {
		log.Printf("multiDayProgramsMigration: check flag: %v (skipping this boot)", err)
		return
	}
	if done {
		return
	}
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
	if len(programIDs) == 0 {
		setMigrationFlag("multi_day_programs_backfilled")
	}
}

// hasColumn reports whether a table already has a column (PRAGMA table_info).
// A query/scan failure is returned as an error, never as "column absent" — a
// false negative would send callers into an ALTER that dies on "duplicate
// column name" (or worse, re-runs a never-re-run backfill).
func hasColumn(table, column string) (bool, error) {
	rows, err := DB.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		return false, err
	}
	defer rows.Close()
	found := false
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull int
		var dflt interface{}
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			return false, err
		}
		if name == column {
			found = true
		}
	}
	return found, rows.Err()
}

// ensureColumn adds a column to a table if it's missing — idempotent on every boot.
// If the existence check itself fails, the alter is skipped (retried next boot),
// matching the pre-refactor silent-skip behavior rather than risking a fatal
// duplicate-column ALTER off an unknown schema state.
func ensureColumn(table, column, alterSQL string) {
	has, err := hasColumn(table, column)
	if err != nil {
		log.Printf("migrations: check %s.%s: %v (skipping alter this boot)", table, column, err)
		return
	}
	if !has {
		if _, err := DB.Exec(alterSQL); err != nil {
			log.Fatalf("alter %s add %s: %v", table, column, err)
		}
		log.Printf("migration: added %s.%s", table, column)
	}
}

// ensureIndex creates an index if it's missing — IF NOT EXISTS already makes this
// idempotent at the SQL level, so unlike ensureColumn there's no existence check to
// get wrong; this just gives the 3-line "Exec + Fatalf" shape a name instead of
// repeating it at every call site.
func ensureIndex(name, createSQL string) {
	if _, err := DB.Exec(createSQL); err != nil {
		log.Fatalf("create %s: %v", name, err)
	}
}

// migration_flags records one-off migrations that must run at most once total,
// never again per boot — distinct from ensureColumn/ensureIndex, whose underlying
// SQL is already idempotent and safe to re-issue every boot. hasMigrationFlag creates
// the table lazily (rather than via the schema/alterMigrations startup path) so a
// caller can check it standalone.
func hasMigrationFlag(name string) (bool, error) {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS migration_flags (name TEXT PRIMARY KEY)`); err != nil {
		return false, err
	}
	var n string
	err := DB.QueryRow(`SELECT name FROM migration_flags WHERE name = ?`, name).Scan(&n)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func setMigrationFlag(name string) {
	if _, err := DB.Exec(`INSERT OR IGNORE INTO migration_flags (name) VALUES (?)`, name); err != nil {
		log.Printf("setMigrationFlag(%s): %v", name, err)
	}
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weight_unit    TEXT    NOT NULL DEFAULT 'lbs',
  calorie_target INTEGER NOT NULL DEFAULT 2000,
  protein_target INTEGER NOT NULL DEFAULT 150,
  carb_target    INTEGER NOT NULL DEFAULT 250,
  fat_target     INTEGER NOT NULL DEFAULT 65,
  timezone       TEXT    NOT NULL DEFAULT 'UTC'
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

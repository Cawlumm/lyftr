package stores

import (
	"database/sql"
	"errors"
	"reflect"
	"testing"
)

func mustExec(t *testing.T, conn *sql.DB, q string, args ...any) int64 {
	t.Helper()
	res, err := conn.Exec(q, args...)
	if err != nil {
		t.Fatalf("exec %q: %v", q, err)
	}
	id, _ := res.LastInsertId()
	return id
}

// seedAccount inserts a user with n workouts (each with one exercise and two sets), n food
// logs, n weight logs, n saved foods, one active session and one program with a day,
// an exercise and a set. Case variants require the nocase index to be absent.
func seedAccount(t *testing.T, conn *sql.DB, email string, n int) int64 {
	t.Helper()
	uid := mustExec(t, conn, `INSERT INTO users (email, password_hash) VALUES (?, 'x')`, email)
	mustExec(t, conn, `INSERT INTO user_settings (user_id) VALUES (?)`, uid)
	mustExec(t, conn, `INSERT OR IGNORE INTO exercises (name) VALUES ('Squat')`)
	var ex int64
	if err := conn.QueryRow(`SELECT id FROM exercises WHERE name = 'Squat'`).Scan(&ex); err != nil {
		t.Fatalf("exercise: %v", err)
	}
	for i := 0; i < n; i++ {
		w := mustExec(t, conn, `INSERT INTO workouts (user_id, name) VALUES (?, 'w')`, uid)
		we := mustExec(t, conn, `INSERT INTO workout_exercises (workout_id, exercise_id) VALUES (?, ?)`, w, ex)
		mustExec(t, conn, `INSERT INTO sets (workout_exercise_id) VALUES (?)`, we)
		mustExec(t, conn, `INSERT INTO sets (workout_exercise_id) VALUES (?)`, we)
		mustExec(t, conn, `INSERT INTO food_logs (user_id, name, logged_on) VALUES (?, 'f', '2026-01-01')`, uid)
		mustExec(t, conn, `INSERT INTO weight_logs (user_id, weight, logged_on) VALUES (?, 180, '2026-01-01')`, uid)
		mustExec(t, conn, `INSERT INTO saved_foods (user_id, name, brand) VALUES (?, ?, 'b')`, uid, "food"+string(rune('a'+i)))
	}
	mustExec(t, conn, `INSERT INTO active_sessions (user_id, data) VALUES (?, '{}')`, uid)
	p := mustExec(t, conn, `INSERT INTO programs (user_id, name) VALUES (?, 'p')`, uid)
	d := mustExec(t, conn, `INSERT INTO program_days (program_id) VALUES (?)`, p)
	pe := mustExec(t, conn, `INSERT INTO program_exercises (program_id, exercise_id, program_day_id) VALUES (?, ?, ?)`, p, ex, d)
	mustExec(t, conn, `INSERT INTO program_sets (program_exercise_id) VALUES (?)`, pe)
	return uid
}

func dropNocaseIndex(t *testing.T, conn *sql.DB) {
	t.Helper()
	mustExec(t, conn, `DROP INDEX IF EXISTS idx_users_email_nocase`)
}

func TestGetByExactEmail(t *testing.T) {
	conn := testDB(t)
	dropNocaseIndex(t, conn)
	s := NewUserStore(conn)

	a := seedAccount(t, conn, "Carter@x.com", 0)
	b := seedAccount(t, conn, "carter@x.com", 0)
	solo := seedAccount(t, conn, "Solo@x.com", 0)
	mustExec(t, conn, `INSERT INTO users (email, password_hash) VALUES ('Dup@x.com', 'x'), ('DUP@x.com', 'x')`)

	t.Run("exact spelling among variants", func(t *testing.T) {
		u, sp, err := s.GetByExactEmail("carter@x.com")
		if err != nil || sp != nil || u.ID != b {
			t.Fatalf("got id %d, %v, %v; want %d", u.ID, sp, err, b)
		}
		u, _, err = s.GetByExactEmail("Carter@x.com")
		if err != nil || u.ID != a {
			t.Fatalf("got id %d, %v; want %d", u.ID, err, a)
		}
	})
	t.Run("single variant is not resolved", func(t *testing.T) {
		u, sp, err := s.GetByExactEmail("solo@x.com")
		if !errors.Is(err, ErrInexactEmail) || u.ID != 0 || !reflect.DeepEqual(sp, []string{"Solo@x.com"}) {
			t.Fatalf("got %d, %v, %v; want ErrInexactEmail with Solo@x.com", u.ID, sp, err)
		}
		_ = solo
	})
	t.Run("several variants, none exact", func(t *testing.T) {
		_, sp, err := s.GetByExactEmail("dup@x.com")
		if !errors.Is(err, ErrInexactEmail) || !reflect.DeepEqual(sp, []string{"Dup@x.com", "DUP@x.com"}) {
			t.Fatalf("got %v, %v", sp, err)
		}
	})
	t.Run("absent", func(t *testing.T) {
		_, sp, err := s.GetByExactEmail("nobody@x.com")
		if !errors.Is(err, ErrNoSuchUser) || sp != nil {
			t.Fatalf("got %v, %v", sp, err)
		}
	})
}

func TestCountDataCountsOnlyThatAccount(t *testing.T) {
	conn := testDB(t)
	s := NewUserStore(conn)
	a := seedAccount(t, conn, "a@x.com", 3)
	b := seedAccount(t, conn, "b@x.com", 1)

	got, err := s.CountData(a)
	if err != nil {
		t.Fatal(err)
	}
	want := AccountData{Workouts: 3, Sets: 6, FoodLogs: 3, WeightLogs: 3, Programs: 1, SavedFoods: 3, ActiveSessions: 1}
	if got != want {
		t.Errorf("a: got %+v, want %+v", got, want)
	}
	got, _ = s.CountData(b)
	want = AccountData{Workouts: 1, Sets: 2, FoodLogs: 1, WeightLogs: 1, Programs: 1, SavedFoods: 1, ActiveSessions: 1}
	if got != want {
		t.Errorf("b: got %+v, want %+v", got, want)
	}
}

// CountData lists tables by hand. This fails when a table gains a foreign key to users
// that the summary does not know about.
func TestCountDataCoversEveryUserOwnedTable(t *testing.T) {
	conn := testDB(t)
	rows, err := conn.Query(`SELECT m.name FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f
		WHERE m.type = 'table' AND f."table" = 'users' ORDER BY m.name`)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			t.Fatal(err)
		}
		got = append(got, n)
	}
	rows.Close()
	want := []string{"active_sessions", "food_logs", "programs", "saved_foods", "user_settings", "weight_logs", "workouts"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("user-owned tables = %v, want %v; add any new table to UserStore.CountData", got, want)
	}
}

func TestDeleteCascadesEveryChildTable(t *testing.T) {
	conn := testDB(t)
	s := NewUserStore(conn)
	a := seedAccount(t, conn, "a@x.com", 2)
	b := seedAccount(t, conn, "b@x.com", 2)
	before, _ := s.CountData(b)

	if err := s.Delete(a); err != nil {
		t.Fatal(err)
	}

	owned := map[string]string{
		"users":             `SELECT COUNT(*) FROM users WHERE id = ?`,
		"user_settings":     `SELECT COUNT(*) FROM user_settings WHERE user_id = ?`,
		"active_sessions":   `SELECT COUNT(*) FROM active_sessions WHERE user_id = ?`,
		"workouts":          `SELECT COUNT(*) FROM workouts WHERE user_id = ?`,
		"food_logs":         `SELECT COUNT(*) FROM food_logs WHERE user_id = ?`,
		"weight_logs":       `SELECT COUNT(*) FROM weight_logs WHERE user_id = ?`,
		"saved_foods":       `SELECT COUNT(*) FROM saved_foods WHERE user_id = ?`,
		"programs":          `SELECT COUNT(*) FROM programs WHERE user_id = ?`,
		"workout_exercises": `SELECT COUNT(*) FROM workout_exercises WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = ?)`,
	}
	for name, q := range owned {
		var n int
		if err := conn.QueryRow(q, a).Scan(&n); err != nil || n != 0 {
			t.Errorf("%s: %d rows left for the deleted account (%v)", name, n, err)
		}
	}
	// Grandchildren have no user_id; with a's rows gone only b's must remain.
	for table, want := range map[string]int{
		"workout_exercises": 2, "sets": 4, "program_days": 1, "program_exercises": 1, "program_sets": 1, "exercises": 1,
	} {
		var n int
		if err := conn.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&n); err != nil || n != want {
			t.Errorf("%s: %d rows, want %d (%v)", table, n, want, err)
		}
	}
	after, _ := s.CountData(b)
	if after != before {
		t.Errorf("other account changed: %+v -> %+v", before, after)
	}
}

func TestChangeEmail(t *testing.T) {
	setup := func(t *testing.T) (*sql.DB, *UserStore) {
		conn := testDB(t)
		return conn, NewUserStore(conn)
	}
	hashOf := func(t *testing.T, conn *sql.DB, uid int64) string {
		var h string
		if err := conn.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, uid).Scan(&h); err != nil {
			t.Fatal(err)
		}
		return h
	}

	t.Run("another account in another case is taken", func(t *testing.T) {
		conn, s := setup(t)
		seedAccount(t, conn, "carter@x.com", 0)
		me := seedAccount(t, conn, "me@x.com", 0)
		if _, err := s.ChangeEmail(me, "x", "Carter@X.com"); !errors.Is(err, ErrEmailTaken) {
			t.Fatalf("err = %v, want ErrEmailTaken", err)
		}
	})

	t.Run("own case change", func(t *testing.T) {
		conn, s := setup(t)
		me := seedAccount(t, conn, "carter@x.com", 0)
		before, _ := s.TokenVersion(me)
		u, err := s.ChangeEmail(me, "x", "Carter@x.com")
		if err != nil {
			t.Fatal(err)
		}
		if u.Email != "Carter@x.com" || u.CreatedAt.IsZero() {
			t.Errorf("user = %+v", u)
		}
		if after, _ := s.TokenVersion(me); after != before || u.TokenVersion != before {
			t.Errorf("a case-only change moved token_version %d -> %d (returned %d)", before, after, u.TokenVersion)
		}
	})

	t.Run("stale hash", func(t *testing.T) {
		conn, s := setup(t)
		me := seedAccount(t, conn, "me@x.com", 0)
		if _, err := s.ChangeEmail(me, "stale", "new@x.com"); !errors.Is(err, ErrPasswordChanged) {
			t.Fatalf("err = %v, want ErrPasswordChanged", err)
		}
		var e string
		if err := conn.QueryRow(`SELECT email FROM users WHERE id = ?`, me).Scan(&e); err != nil || e != "me@x.com" {
			t.Errorf("email = %q, %v; want unchanged", e, err)
		}
	})

	t.Run("index absent", func(t *testing.T) {
		conn, s := setup(t)
		dropNocaseIndex(t, conn)
		seedAccount(t, conn, "Carter@x.com", 0)
		me := seedAccount(t, conn, "carter@x.com", 0)
		if _, err := s.ChangeEmail(me, "x", "CARTER@x.com"); !errors.Is(err, ErrEmailTaken) {
			t.Fatalf("err = %v, want ErrEmailTaken", err)
		}
	})

	t.Run("token_version bumped", func(t *testing.T) {
		conn, s := setup(t)
		me := seedAccount(t, conn, "me@x.com", 0)
		before, _ := s.TokenVersion(me)
		u, err := s.ChangeEmail(me, hashOf(t, conn, me), "new@x.com")
		if err != nil {
			t.Fatal(err)
		}
		after, _ := s.TokenVersion(me)
		if after != before+1 {
			t.Errorf("token_version %d -> %d, want +1", before, after)
		}
		if u.TokenVersion != after {
			t.Errorf("returned version %d, stored %d", u.TokenVersion, after)
		}
	})
}

package main

import (
	"bytes"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
)

// setupDeleteDB points the config at a fresh temp-file database, builds the schema and
// drops the nocase email index so case-variant accounts can be seeded. The env is set
// explicitly so backend/.env cannot leak in (godotenv never overrides a set variable).
func setupDeleteDB(t *testing.T, registration string) {
	t.Helper()
	t.Setenv("DB_PATH", filepath.Join(t.TempDir(), "lyftr.db"))
	t.Setenv("ENV", "test")
	t.Setenv("REGISTRATION", registration)
	t.Setenv("DEMO_MODE", "false")

	var sink bytes.Buffer
	log.SetOutput(&sink)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })

	reconnect()
	// Registered after TempDir, so it runs first: Windows cannot remove an open SQLite file.
	t.Cleanup(func() { db.DB.Close() })
	if _, err := db.DB.Exec(`DROP INDEX IF EXISTS idx_users_email_nocase`); err != nil {
		t.Fatal(err)
	}
}

// reconnect opens the database the way the server and the subcommands do.
func reconnect() {
	if db.DB != nil {
		db.DB.Close()
	}
	config.Load()
	db.Connect()
}

func execSQL(t *testing.T, q string, args ...any) int64 {
	t.Helper()
	res, err := db.DB.Exec(q, args...)
	if err != nil {
		t.Fatalf("exec %q: %v", q, err)
	}
	id, _ := res.LastInsertId()
	return id
}

func seedFullAccount(t *testing.T, email string) int64 {
	t.Helper()
	uid := execSQL(t, `INSERT INTO users (email, password_hash) VALUES (?, 'x')`, email)
	execSQL(t, `INSERT INTO user_settings (user_id) VALUES (?)`, uid)
	execSQL(t, `INSERT OR IGNORE INTO exercises (name) VALUES ('Squat')`)
	var ex int64
	if err := db.DB.QueryRow(`SELECT id FROM exercises WHERE name = 'Squat'`).Scan(&ex); err != nil {
		t.Fatal(err)
	}
	w := execSQL(t, `INSERT INTO workouts (user_id, name) VALUES (?, 'w')`, uid)
	we := execSQL(t, `INSERT INTO workout_exercises (workout_id, exercise_id) VALUES (?, ?)`, w, ex)
	execSQL(t, `INSERT INTO sets (workout_exercise_id) VALUES (?)`, we)
	execSQL(t, `INSERT INTO food_logs (user_id, name, logged_on) VALUES (?, 'f', '2026-01-01')`, uid)
	execSQL(t, `INSERT INTO weight_logs (user_id, weight, logged_on) VALUES (?, 180, '2026-01-01')`, uid)
	execSQL(t, `INSERT INTO saved_foods (user_id, name) VALUES (?, 's')`, uid)
	execSQL(t, `INSERT INTO active_sessions (user_id, data) VALUES (?, '{}')`, uid)
	p := execSQL(t, `INSERT INTO programs (user_id, name) VALUES (?, 'p')`, uid)
	d := execSQL(t, `INSERT INTO program_days (program_id) VALUES (?)`, p)
	pe := execSQL(t, `INSERT INTO program_exercises (program_id, exercise_id, program_day_id) VALUES (?, ?, ?)`, p, ex, d)
	execSQL(t, `INSERT INTO program_sets (program_exercise_id) VALUES (?)`, pe)
	return uid
}

func userCount(t *testing.T) int {
	t.Helper()
	n, err := stores.New(db.DB).User.Count()
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func dataOf(t *testing.T, uid int64) stores.AccountData {
	t.Helper()
	d, err := stores.New(db.DB).User.CountData(uid)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// runDelete runs the subcommand with stdin, capturing stdout and stderr. Log output goes
// to a separate buffer so the boot warning, which names the same spellings, cannot
// satisfy an assertion about the command's own output. The command reconnects, so the
// test's handle is closed first and db.DB is the command's afterwards.
func runDelete(t *testing.T, stdin string, args ...string) (code int, stdout, stderr string) {
	t.Helper()
	db.DB.Close()
	withStdin(t, stdin)

	var logSink bytes.Buffer
	log.SetOutput(&logSink)

	origOut, origErr := os.Stdout, os.Stderr
	ro, wo, _ := os.Pipe()
	re, we, _ := os.Pipe()
	os.Stdout, os.Stderr = wo, we
	outc, errc := make(chan string), make(chan string)
	go func() { b, _ := io.ReadAll(ro); outc <- string(b) }()
	go func() { b, _ := io.ReadAll(re); errc <- string(b) }()

	code = runDeleteAccount(args)

	wo.Close()
	we.Close()
	os.Stdout, os.Stderr = origOut, origErr
	return code, <-outc, <-errc
}

func TestDeleteAccountExactMatchDeletesAndCascades(t *testing.T) {
	setupDeleteDB(t, "open")
	uid := seedFullAccount(t, "a@x.com")
	seedFullAccount(t, "b@x.com")

	code, out, errOut := runDelete(t, "a@x.com\n", "a@x.com")
	if code != 0 {
		t.Fatalf("exit %d, stderr %q", code, errOut)
	}
	if !strings.Contains(out, "This deletes a@x.com and its settings, along with:") || !strings.Contains(out, "Deleted a@x.com") {
		t.Errorf("stdout missing header or success line: %q", out)
	}
	if userCount(t) != 1 {
		t.Errorf("users = %d, want 1", userCount(t))
	}
	if d := dataOf(t, uid); d != (stores.AccountData{}) {
		t.Errorf("data left behind: %+v", d)
	}
}

func TestDeleteAccountCaseVariantDeletesNothing(t *testing.T) {
	setupDeleteDB(t, "open")
	uid := seedFullAccount(t, "Carter@x.com")

	code, _, errOut := runDelete(t, "carter@x.com\n", "carter@x.com")
	if code != 1 {
		t.Fatalf("exit %d, want 1", code)
	}
	if !strings.Contains(errOut, "Carter@x.com") || !strings.Contains(errOut, "Nothing was deleted") {
		t.Errorf("stderr should list the spelling: %q", errOut)
	}
	if userCount(t) != 1 || dataOf(t, uid).Workouts != 1 {
		t.Error("something was deleted")
	}
}

func TestDeleteAccountWrongConfirmationDeletesNothing(t *testing.T) {
	for name, stdin := range map[string]string{
		"different text": "nope\n",
		"different case": "A@x.com\n",
		"trailing space": "a@x.com \n",
		"empty line":     "\n",
		"eof":            "",
	} {
		t.Run(name, func(t *testing.T) {
			setupDeleteDB(t, "open")
			uid := seedFullAccount(t, "a@x.com")
			code, _, _ := runDelete(t, stdin, "a@x.com")
			if code != 1 {
				t.Fatalf("exit %d, want 1", code)
			}
			if userCount(t) != 1 || dataOf(t, uid).Workouts != 1 {
				t.Error("something was deleted")
			}
		})
	}
}

func TestDeleteAccountUnknownAddress(t *testing.T) {
	setupDeleteDB(t, "open")
	seedFullAccount(t, "a@x.com")
	code, _, errOut := runDelete(t, "nobody@x.com\n", "nobody@x.com")
	if code != 1 || !strings.Contains(errOut, "no account found") {
		t.Errorf("exit %d, stderr %q", code, errOut)
	}
	if userCount(t) != 1 {
		t.Error("something was deleted")
	}
}

func TestDeleteAccountUsage(t *testing.T) {
	for _, args := range [][]string{nil, {"a@x.com", "b@x.com"}, {"--yes"}, {"  "}} {
		origErr := os.Stderr
		r, w, _ := os.Pipe()
		os.Stderr = w
		code := runDeleteAccount(args)
		w.Close()
		os.Stderr = origErr
		got, _ := io.ReadAll(r)
		if code != 2 || !strings.Contains(string(got), "docker compose exec") {
			t.Errorf("args %q: exit %d, stderr %q", args, code, got)
		}
	}
}

func TestDeleteAccountResolvesCollisionAndIndexFollows(t *testing.T) {
	setupDeleteDB(t, "open")
	keep := seedFullAccount(t, "Carter@x.com")
	drop := seedFullAccount(t, "carter@x.com")
	keptBefore := dataOf(t, keep)

	code, _, errOut := runDelete(t, "carter@x.com\n", "carter@x.com")
	if code != 0 {
		t.Fatalf("exit %d, stderr %q", code, errOut)
	}
	if dataOf(t, drop) != (stores.AccountData{}) {
		t.Error("deleted account kept data")
	}
	if dataOf(t, keep) != keptBefore {
		t.Error("the other account's data changed")
	}
	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM user_settings WHERE user_id = ?`, keep).Scan(&n); err != nil || n != 1 {
		t.Errorf("kept account's settings = %d, %v", n, err)
	}
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM users WHERE email = 'carter@x.com'`).Scan(&n); err != nil || n != 0 {
		t.Errorf("deleted spelling still present: %d, %v", n, err)
	}

	// Second boot: the collision is gone, so the index is created and enforced.
	reconnect()
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name = 'idx_users_email_nocase'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("index count = %d, %v; want 1", n, err)
	}
	if _, err := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('CARTER@x.com', 'x')`); err == nil {
		t.Error("a case variant was accepted after the index was created")
	}
}

func TestDeleteAccountWarnsOnLastAccount(t *testing.T) {
	setupDeleteDB(t, "first-user")
	seedFullAccount(t, "a@x.com")
	code, out, errOut := runDelete(t, "a@x.com\n", "a@x.com")
	if code != 0 {
		t.Fatalf("exit %d, stderr %q", code, errOut)
	}
	warn := strings.Index(out, "whoever registers next becomes the owner")
	prompt := strings.Index(out, "to confirm:")
	if warn < 0 || prompt < 0 || warn > prompt {
		t.Errorf("warning should precede the prompt: %q", out)
	}
}

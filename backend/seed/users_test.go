package seed

import (
	"database/sql"
	"testing"

	"github.com/Cawlumm/lyftr-backend/utils"

	_ "modernc.org/sqlite"
)

func demoTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	for _, q := range []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
		  token_version INTEGER NOT NULL DEFAULT 1, is_admin INTEGER NOT NULL DEFAULT 0, updated_at DATETIME)`,
		`CREATE TABLE user_settings (user_id INTEGER)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func userCount(t *testing.T, db *sql.DB) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestDemoUserCreatesTheAccountOnce(t *testing.T) {
	db := demoTestDB(t)
	DemoUser(db)
	DemoUser(db)
	if n := userCount(t, db); n != 1 {
		t.Errorf("users = %d, want 1", n)
	}
}

func TestDemoUserDoesNotCreateOneBesideACaseVariant(t *testing.T) {
	db := demoTestDB(t)
	if _, err := db.Exec(`INSERT INTO users (email, password_hash) VALUES ('Demo@Lyftr.Local', 'x')`); err != nil {
		t.Fatal(err)
	}
	DemoUser(db)
	if n := userCount(t, db); n != 1 {
		t.Errorf("users = %d, want 1: a second case-variant demo account was created", n)
	}
}

func TestDemoUserResetsAChangedPasswordOnBoot(t *testing.T) {
	db := demoTestDB(t)
	DemoUser(db)

	hash, err := utils.HashPassword("someone-elses-password")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE users SET password_hash = ?, is_admin = 1`, hash); err != nil {
		t.Fatal(err)
	}

	DemoUser(db)

	var got string
	var version, admin int
	if err := db.QueryRow(`SELECT password_hash, token_version, is_admin FROM users`).Scan(&got, &version, &admin); err != nil {
		t.Fatal(err)
	}
	if !utils.CheckPassword(DemoPassword, got) {
		t.Error("the published password does not work after boot")
	}
	if utils.CheckPassword("someone-elses-password", got) {
		t.Error("the changed password still works after boot")
	}
	if version != 2 {
		t.Errorf("token_version = %d, want 2 so sessions minted with the changed password end", version)
	}
	if admin != 0 {
		t.Error("the demo account kept its admin flag")
	}
}

func TestDemoUserLeavesAnUnchangedPasswordAlone(t *testing.T) {
	db := demoTestDB(t)
	DemoUser(db)
	var before string
	db.QueryRow(`SELECT password_hash FROM users`).Scan(&before)

	DemoUser(db)

	var after string
	var version int
	db.QueryRow(`SELECT password_hash, token_version FROM users`).Scan(&after, &version)
	if after != before || version != 1 {
		t.Errorf("an untouched demo account was rewritten (version %d)", version)
	}
}

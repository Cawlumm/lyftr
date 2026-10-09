package seed

import (
	"database/sql"
	"testing"

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
		`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)`,
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

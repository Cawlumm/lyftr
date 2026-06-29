package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	"github.com/Cawlumm/lyftr-backend/config"
	_ "modernc.org/sqlite"
)

var DB *sql.DB

func Connect() {
	dbPath := config.C.DBPath

	// Ensure the directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		log.Fatalf("failed to create db directory: %v", err)
	}

	var err error
	// modernc.org/sqlite uses _pragma=NAME(VALUE) DSN syntax. The old mattn-style
	// params (_journal_mode=…&_busy_timeout=…) were silently ignored, leaving
	// busy_timeout at 0 — so any contended lock failed instantly (a write racing
	// other requests would 500). Fix:
	//   busy_timeout(5000): wait up to 5s for a lock instead of erroring.
	//   journal_mode(WAL): readers don't block the writer; fewer locks.
	//   synchronous(NORMAL): the safe, faster durability setting under WAL.
	//   foreign_keys(on): keep cascade deletes working (DeleteAccount relies on it).
	DB, err = sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(on)")
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	// SQLite is a single writer — it does not do concurrent writes. Rather than
	// fight that with a larger pool (which only turns contention into lock errors
	// to retry), serialize all DB access through ONE connection. With the
	// nested-cursor fix (no request needs a second connection mid-query), one
	// connection is sufficient and leaves no in-process lock contention to fail on.
	// The busy_timeout/WAL pragmas above remain only as cheap cross-process defense.
	DB.SetMaxOpenConns(1)
	DB.SetMaxIdleConns(1)

	if err = DB.Ping(); err != nil {
		log.Fatalf("failed to ping database: %v", err)
	}

	if err = migrate(); err != nil {
		log.Fatalf("migration failed: %v", err)
	}

	alterMigrations()

	log.Printf("SQLite database ready at %s", dbPath)
}

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
	// modernc.org/sqlite uses the _pragma=NAME(VALUE) DSN syntax. The old
	// mattn-style params (_journal_mode=…&_busy_timeout=…) were silently ignored,
	// which left busy_timeout at 0 — so any contended lock failed instantly.
	//   busy_timeout: wait up to 5s for a lock to clear (incl. cross-process
	//                 contention like a NAS backup) instead of erroring immediately.
	//   journal_mode=WAL: readers don't block the writer; faster, fewer locks.
	//   synchronous=NORMAL: the safe, faster durability setting under WAL.
	DB, err = sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	// WAL + busy_timeout (above) is what makes concurrent access safe; the pool
	// size just bounds it. Note: a single connection is NOT safe here — several
	// handlers issue a query while a parent rows cursor is still open (e.g.
	// loadWorkoutExercises -> loadSets), which needs more than one connection, so
	// MaxOpenConns(1) would deadlock them.
	DB.SetMaxOpenConns(10)
	DB.SetMaxIdleConns(5)

	if err = DB.Ping(); err != nil {
		log.Fatalf("failed to ping database: %v", err)
	}

	if err = migrate(); err != nil {
		log.Fatalf("migration failed: %v", err)
	}

	alterMigrations()

	log.Printf("SQLite database ready at %s", dbPath)
}

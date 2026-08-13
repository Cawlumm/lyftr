package db

import (
	"context"
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/Cawlumm/lyftr-backend/config"
	_ "modernc.org/sqlite"
)

var DB *sql.DB

// How long Close waits to get the single connection for the final checkpoint. Compose
// allows 10s between SIGTERM and SIGKILL; the HTTP drain takes the first 5s, so this
// is the rest of that budget.
const checkpointTimeout = 4 * time.Second

// BuildSchema brings an already-open DB to the current schema: base tables, then
// every migration, in the same order Connect uses.
//
// Exists so tests outside this package build their database the way production does
// instead of keeping a copy of the DDL. The controller tests used to carry a
// hand-maintained 138-line schema, which had already drifted — it created
// program_days (a migration artifact, not a base table) and omitted active_sessions
// entirely — so a column added to a migration compiled fine and failed at runtime.
func BuildSchema() error {
	if err := migrate(); err != nil {
		return err
	}
	alterMigrations()
	return nil
}

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

// Close folds the write-ahead log back into lyftr.db and shuts the pool down.
//
// It exists because nothing used to call it. `docker compose down` sends SIGTERM,
// gin's r.Run ignored it, and the process died with the WAL un-checkpointed — while
// our own docs told self-hosters their backup was `cp ./data/lyftr.db`. On a test
// instance that copy held 0 of 29 food logs and 14 of 79 weight logs; the rest had
// never left lyftr.db-wal.
//
// The explicit checkpoint is NOT redundant, which is the trap here. sql.DB.Close()
// closes only the connections sitting idle in the pool and returns immediately;
// a connection currently checked out is closed later, when its holder gives it back.
// Since we run SetMaxOpenConns(1), one goroutine mid-transaction — the exercise seed
// on a fresh instance, or a request still draining — means the sqlite handle is never
// closed at all and no checkpoint happens. Measured: with a connection checked out,
// Close returned in 0s, left 832 KB in the -wal, and a copy of lyftr.db had no tables.
//
// Doing the checkpoint through the pool first is what fixes that: with one connection
// the PRAGMA queues behind whoever holds it, so it runs after that work finishes
// rather than racing it. The context bounds the wait — a checkpoint that cannot get
// the connection must not hang shutdown past compose's grace period, and a loud log
// beats a silent truncation.
//
// TRUNCATE rather than PASSIVE so the -wal is emptied, not merely folded in: a
// leftover -wal is what makes a restore silently replay over the file just put back.
func Close() {
	if DB == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), checkpointTimeout)
	defer cancel()
	if _, err := DB.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		log.Printf("WARNING: wal checkpoint failed after %s — recent writes may still be "+
			"in lyftr.db-wal, so a copy of lyftr.db alone is NOT a complete backup: %v",
			checkpointTimeout, err)
	}

	if err := DB.Close(); err != nil {
		log.Printf("db close failed: %v", err)
	}
}

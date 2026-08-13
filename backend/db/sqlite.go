package db

import (
	"context"
	"database/sql"
	"fmt"
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
// rather than racing it. See checkpoint below for why that call is not a one-liner.
//
// TRUNCATE rather than PASSIVE so the -wal is emptied, not merely folded in: a
// leftover -wal is what makes a restore silently replay over the file just put back.
func Close() {
	if DB == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), checkpointTimeout)
	defer cancel()
	if err := checkpoint(ctx); err != nil {
		log.Printf("WARNING: %v — recent writes may still be in lyftr.db-wal, so a copy "+
			"of lyftr.db alone is NOT a complete backup right now", err)
	}

	if err := DB.Close(); err != nil {
		log.Printf("db close failed: %v", err)
	}
}

// checkpoint runs the final TRUNCATE and reports honestly whether it worked.
//
// Two traps make the obvious one-liner wrong, both measured:
//
//   - `PRAGMA wal_checkpoint` reports failure in its RESULT ROW, not as an error.
//     It returns (busy, log, checkpointed) and the status stays SQLITE_OK, so
//     DB.Exec(...) on a blocked checkpoint returns err == nil having folded nothing:
//     `err=<nil> busy=1 log=202 checkpointed=202`, WAL unchanged. Any warning keyed off
//     the error alone can never fire — which is the silent truncation, dressed as a fix.
//     So scan the row and treat busy != 0 as the failure it is.
//
//   - The context does not bound the driver's own wait. Connect sets busy_timeout(5000);
//     that sleep is not interruptible, so a 4s context just relabels a 5s call
//     (measured: elapsed=5.03s against checkpointTimeout=4s). Shutdown has a hard
//     ceiling — compose SIGKILLs at 10s — so lower busy_timeout on this one connection
//     and let the loop below own the retry budget instead.
func checkpoint(ctx context.Context) error {
	conn, err := DB.Conn(ctx)
	if err != nil {
		return fmt.Errorf("could not get a connection to checkpoint the WAL: %w", err)
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "PRAGMA busy_timeout=250"); err != nil {
		return fmt.Errorf("could not lower busy_timeout for the checkpoint: %w", err)
	}

	for {
		var busy, logFrames, checkpointed int
		row := conn.QueryRowContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)")
		if err := row.Scan(&busy, &logFrames, &checkpointed); err != nil {
			return fmt.Errorf("wal checkpoint failed: %w", err)
		}
		if busy == 0 {
			return nil
		}
		// Someone else holds a read lock — the sqlite3 CLI this image ships, a `fly ssh
		// console` session, a backup mid-VACUUM. Retry until the budget runs out.
		select {
		case <-ctx.Done():
			return fmt.Errorf("wal checkpoint still blocked after %s with %d frames in the WAL "+
				"(another sqlite connection is holding it open)", checkpointTimeout, logFrames)
		case <-time.After(200 * time.Millisecond):
		}
	}
}

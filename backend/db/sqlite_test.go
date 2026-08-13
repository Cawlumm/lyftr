package db

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

const walDSN = "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(on)"

func openWAL(t *testing.T, path string) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", path+walDSN)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	conn.SetMaxOpenConns(1)
	return conn
}

// The self-host docs tell people their backup is the lyftr.db file. Under WAL that is
// only true if the WAL has been folded in before the process exits — otherwise
// `docker compose down` strands recent writes in lyftr.db-wal and the "backup" is
// missing them. This pins the behaviour that makes the documented backup honest.
func TestCloseCheckpointsWALIntoTheDatabaseFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lyftr.db")

	DB = openWAL(t, path)
	t.Cleanup(func() { DB = nil })

	if _, err := DB.Exec("CREATE TABLE workouts (id INTEGER PRIMARY KEY, name TEXT)"); err != nil {
		t.Fatalf("create: %v", err)
	}
	for i := 0; i < 200; i++ {
		if _, err := DB.Exec("INSERT INTO workouts (name) VALUES (?)", "leg day"); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}

	// Precondition: the writes really are in the WAL, not already in the main file.
	// Without this the test would pass on a build where WAL was never enabled.
	if wal, err := os.Stat(path + "-wal"); err != nil || wal.Size() == 0 {
		t.Fatalf("expected a non-empty WAL before Close, got %v (err %v)", wal, err)
	}

	Close()

	// SQLite removes the -wal on a clean close; an empty one would be fine too.
	if wal, err := os.Stat(path + "-wal"); err == nil && wal.Size() != 0 {
		t.Errorf("WAL still holds %d bytes after Close; a cp of lyftr.db would lose them", wal.Size())
	}

	// The real assertion: open ONLY the main file, as a restored copy would be.
	restored := filepath.Join(t.TempDir(), "restored.db")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read db: %v", err)
	}
	if err := os.WriteFile(restored, data, 0o644); err != nil {
		t.Fatalf("write copy: %v", err)
	}

	conn := openWAL(t, restored)
	defer conn.Close()
	var n int
	if err := conn.QueryRow("SELECT COUNT(*) FROM workouts").Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 200 {
		t.Errorf("copy of lyftr.db has %d rows, want 200 — the WAL was not checkpointed", n)
	}
}

// The case above closes an idle pool, which is the one state where sql.DB.Close() is
// sufficient on its own — so on its own it pins the claim rather than the behaviour.
// This is the shape that actually broke: something still holds the single connection at
// SIGTERM (the exercise seed's insert transaction on a fresh instance, or a request
// still draining). Close() used to return instantly and strand the whole WAL; measured
// before the fix, a copy of lyftr.db had no tables at all.
func TestCloseCheckpointsEvenWithAConnectionCheckedOut(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lyftr.db")

	DB = openWAL(t, path)
	t.Cleanup(func() { DB = nil })

	if _, err := DB.Exec("CREATE TABLE workouts (id INTEGER PRIMARY KEY, name TEXT)"); err != nil {
		t.Fatalf("create: %v", err)
	}
	for i := 0; i < 200; i++ {
		if _, err := DB.Exec("INSERT INTO workouts (name) VALUES (?)", "leg day"); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}

	// Hold the pool's only connection, then hand it back shortly — a seed transaction
	// finishing just after the signal arrives. Close must wait for it, not skip past.
	conn, err := DB.Conn(context.Background())
	if err != nil {
		t.Fatalf("conn: %v", err)
	}
	go func() {
		time.Sleep(300 * time.Millisecond)
		conn.Close()
	}()

	Close()

	// Sample the instant Close returns, and do NOT wait for the holder first. That
	// ordering is the whole test. Handing the connection back would let database/sql
	// close it and SQLite would checkpoint on its way out — so a version of Close that
	// returned early would still look clean if measured afterwards. It is not clean in
	// production: main() exits the moment Close returns, and the process dies before
	// that deferred close ever runs. The property is that Close blocks until the WAL
	// is folded, not that the WAL is folded eventually.
	walAfterClose := int64(0)
	if wal, err := os.Stat(path + "-wal"); err == nil {
		walAfterClose = wal.Size()
	}
	if walAfterClose != 0 {
		t.Errorf("Close returned with %d bytes still in the WAL; a process exiting here loses them", walAfterClose)
	}

	restored := filepath.Join(t.TempDir(), "restored.db")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read db: %v", err)
	}
	if err := os.WriteFile(restored, data, 0o644); err != nil {
		t.Fatalf("write copy: %v", err)
	}

	check := openWAL(t, restored)
	defer check.Close()
	var n int
	if err := check.QueryRow("SELECT COUNT(*) FROM workouts").Scan(&n); err != nil {
		t.Fatalf("count (a copy of lyftr.db is not even a readable database): %v", err)
	}
	if n != 200 {
		t.Errorf("copy of lyftr.db has %d rows, want 200 — the WAL was not checkpointed", n)
	}
}

func TestCloseOnNilDBDoesNotPanic(t *testing.T) {
	DB = nil
	Close()
}

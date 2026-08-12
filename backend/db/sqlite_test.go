package db

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

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

func TestCloseOnNilDBDoesNotPanic(t *testing.T) {
	DB = nil
	Close()
}

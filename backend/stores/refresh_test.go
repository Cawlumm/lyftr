package stores

import (
	"testing"
	"time"
)

func TestRefreshStoreRotate(t *testing.T) {
	conn := testDB(t)
	uid := mustExec(t, conn, `INSERT INTO users (email, password_hash) VALUES ('r@x.com', 'x')`)
	other := mustExec(t, conn, `INSERT INTO users (email, password_hash) VALUES ('o@x.com', 'x')`)
	s := NewRefreshStore(conn)
	now := time.Now()
	grace := 30 * time.Second

	if err := s.Issue("a", uid, now, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	expect := func(name, jti string, who int64, at time.Time, want RotateResult) {
		t.Helper()
		got, err := s.Rotate(jti, who, at, grace)
		if err != nil || got != want {
			t.Errorf("%s = %v, %v; want %v", name, got, err, want)
		}
	}
	expect("another user's claim on the jti", "a", other, now, RotateUnknown)
	expect("unknown jti", "zzz", uid, now, RotateUnknown)
	expect("first use", "a", uid, now, RotateOK)
	expect("repeat inside grace", "a", uid, now.Add(10*time.Second), RotateReplay)
	expect("repeat after grace", "a", uid, now.Add(time.Minute), RotateReuse)

	if err := s.Issue("b", uid, now, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := s.Revoke("b", other, now); err != nil { // someone else's revoke does nothing
		t.Fatal(err)
	}
	expect("not revoked by a stranger", "b", uid, now, RotateOK)
	if err := s.Revoke("b", uid, now); err != nil {
		t.Fatal(err)
	}
	expect("revoked", "b", uid, now, RotateRevoked)
}

func TestRefreshStoreIssueDropsExpiredRows(t *testing.T) {
	conn := testDB(t)
	uid := mustExec(t, conn, `INSERT INTO users (email, password_hash) VALUES ('r@x.com', 'x')`)
	s := NewRefreshStore(conn)
	now := time.Now()
	if err := s.Issue("old", uid, now.Add(-48*time.Hour), now.Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := s.Issue("new", uid, now, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM refresh_tokens`).Scan(&n); err != nil || n != 1 {
		t.Errorf("rows = %d, %v; want only the unexpired one", n, err)
	}
}

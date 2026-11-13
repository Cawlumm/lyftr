package middleware

import (
	"fmt"
	"testing"
	"time"
)

func fakeClock(l *Limiter) *time.Time {
	now := time.Unix(1_000_000, 0)
	l.now = func() time.Time { return now }
	return &now
}

func TestLimiterBurstThenRefill(t *testing.T) {
	l := NewLimiter(6, 3, 100) // 6/min = one token every 10s
	now := fakeClock(l)

	for i := range 3 {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("request %d inside the burst was refused", i)
		}
	}
	ok, wait := l.Allow("a")
	if ok {
		t.Fatal("a 4th request inside the burst window was allowed")
	}
	if wait < 9*time.Second || wait > 10*time.Second {
		t.Errorf("wait = %v, want about 10s", wait)
	}

	*now = now.Add(10 * time.Second)
	if ok, _ := l.Allow("a"); !ok {
		t.Error("a token should have refilled after 10s")
	}
	if ok, _ := l.Allow("a"); ok {
		t.Error("only one token should have refilled")
	}

	// Idle time never banks more than the burst.
	*now = now.Add(time.Hour)
	granted := 0
	for range 10 {
		if ok, _ := l.Allow("a"); ok {
			granted++
		}
	}
	if granted != 3 {
		t.Errorf("after a long idle %d requests passed, want the burst of 3", granted)
	}
}

func TestLimiterKeysAreIndependent(t *testing.T) {
	l := NewLimiter(1, 1, 100)
	fakeClock(l)
	if ok, _ := l.Allow("a"); !ok {
		t.Fatal("a first request was refused")
	}
	if ok, _ := l.Allow("a"); ok {
		t.Fatal("a second request for the same key was allowed")
	}
	if ok, _ := l.Allow("b"); !ok {
		t.Error("another key shares a's bucket")
	}
}

func TestLimiterMemoryIsBounded(t *testing.T) {
	l := NewLimiter(1, 1, 50)
	fakeClock(l)
	for i := range 10_000 {
		l.Allow(fmt.Sprintf("10.0.%d.%d", i/256, i%256))
	}
	if n := l.Len(); n != 50 {
		t.Errorf("tracked keys = %d, want capped at 50", n)
	}
	if len(l.entries) != l.order.Len() {
		t.Errorf("map (%d) and list (%d) disagree", len(l.entries), l.order.Len())
	}
}

func TestLimiterEvictsLeastRecentlySeen(t *testing.T) {
	l := NewLimiter(1, 1, 2)
	fakeClock(l)
	l.Allow("a")
	l.Allow("b")
	l.Allow("a") // refused, but a is now the most recent
	l.Allow("c") // evicts b
	if _, ok := l.entries["b"]; ok {
		t.Error("b should have been evicted as least recently seen")
	}
	if _, ok := l.entries["a"]; !ok {
		t.Error("a was evicted though more recent than b")
	}
}

func TestRefundGivesATokenBackUpToBurst(t *testing.T) {
	l := NewLimiter(1, 2, 10)
	fakeClock(l)
	l.Allow("k")
	l.Allow("k")
	if ok, _ := l.Allow("k"); ok {
		t.Fatal("third request should be refused")
	}
	l.Refund("k")
	if ok, _ := l.Allow("k"); !ok {
		t.Error("refunded token was not usable")
	}
	l.Refund("k")
	l.Refund("k")
	l.Refund("k")
	l.Allow("k")
	l.Allow("k")
	if ok, _ := l.Allow("k"); ok {
		t.Error("refund went past the burst")
	}
	l.Refund("unknown")
}

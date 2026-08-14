package seed

import (
	"sync/atomic"
	"testing"
	"time"
)

// The bug this guards: DemoData was launched with a bare `go`, so it was never in the
// WaitGroup and Stop returned in ~0s having waited for nothing.
func TestStopWaitsForTrackedWork(t *testing.T) {
	var finished atomic.Bool
	Go("slow-seed", func() {
		time.Sleep(400 * time.Millisecond)
		finished.Store(true)
	})

	start := time.Now()
	Stop(3 * time.Second)
	elapsed := time.Since(start)

	if !finished.Load() {
		t.Errorf("Stop returned after %v without waiting for the tracked goroutine", elapsed)
	}
	if elapsed < 300*time.Millisecond {
		t.Errorf("Stop returned in %v — too fast to have waited", elapsed)
	}
	t.Logf("Stop waited %v for the goroutine", elapsed)
}

// Go after Stop must not start work, and must not panic the process by calling Add
// concurrently with Stop's Wait.
func TestGoAfterStopDoesNotStartOrPanic(t *testing.T) {
	Stop(time.Second)

	var ran atomic.Bool
	Go("late-seed", func() { ran.Store(true) })
	time.Sleep(150 * time.Millisecond)

	if ran.Load() {
		t.Error("a seed goroutine started after shutdown had begun")
	}
}

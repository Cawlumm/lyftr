package seed

import (
	"context"
	"log"
	"sync"
	"time"
)

// Seeding runs in background goroutines that outlive the request path, so shutdown has
// to account for them explicitly: they are not HTTP work and http.Server.Shutdown does
// not wait for them.
//
// This matters because of what the WAL checkpoint at shutdown assumes. DemoData writes
// through nine separate db.Exec calls with no enclosing transaction, so "the checkpoint
// queues behind the seed" is only true for one statement at a time — the checkpoint can
// land between two of them, after which the seed keeps inserting into a freshly
// truncated WAL and those frames are stranded when the process exits. Stopping the
// seeders before checkpointing is what closes that window.
var (
	stopCtx, stopSeeding = context.WithCancel(context.Background())
	running              sync.WaitGroup

	// Serialises "have we started stopping?" against running.Add. Checking the context
	// and then calling Add is not enough on its own: the two can interleave with Stop's
	// Wait, which is the documented WaitGroup misuse panic.
	mu      sync.Mutex
	stopped bool
)

// Context is what seed loops should watch to abort promptly on shutdown.
func Context() context.Context { return stopCtx }

// Stopping reports whether shutdown has begun. Cheap enough to check between write
// phases in a long seed.
func Stopping() bool { return stopCtx.Err() != nil }

// Sleep is time.Sleep that gives up when shutdown starts. Returns false if it was cut
// short, so a polling loop can bail instead of finishing its full schedule.
func Sleep(d time.Duration) bool {
	select {
	case <-stopCtx.Done():
		return false
	case <-time.After(d):
		return true
	}
}

// Go runs fn as a tracked seed goroutine so Stop can wait for it.
//
// Refuses to start once shutdown has begun, for two reasons. A new seed launched after
// the checkpoint would do a 30s fetch and a full insert transaction into a WAL nothing
// will fold in — and it is reachable, since POST /admin/reset-exercises can outlive the
// drain. And sync.WaitGroup panics on "Add called concurrently with Wait": Stop leaves a
// helper blocked in Wait after its budget expires, so an Add landing as the counter hits
// zero would kill the process outright, before the checkpoint runs.
func Go(name string, fn func()) {
	mu.Lock()
	if stopped {
		mu.Unlock()
		log.Printf("seed: not starting %s, shutting down", name)
		return
	}
	running.Add(1)
	mu.Unlock()

	go func() {
		defer running.Done()
		fn()
	}()
}

// Stop signals the seeders and waits, bounded, for them to finish.
//
// Bounded because shutdown has a hard ceiling — compose SIGKILLs at 10s — and a seed
// that ignores the signal must not be able to hold the process past it. Returning
// early is safe: the checkpoint that follows reports honestly if the WAL could not be
// folded, which is better than hanging until the runtime is killed outright.
func Stop(timeout time.Duration) {
	// Close the door before waiting, under the same lock Go takes, so no goroutine can
	// be registered after Wait has started.
	mu.Lock()
	stopped = true
	mu.Unlock()
	stopSeeding()

	done := make(chan struct{})
	go func() {
		running.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(timeout):
		log.Printf("seed: background seeding did not stop within %s; continuing shutdown", timeout)
	}
}

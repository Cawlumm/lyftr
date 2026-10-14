package stores

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"time"
)

// CatalogSyncInterval is how long an upstream correction or a new translation takes to
// reach readers.
const CatalogSyncInterval = 24 * time.Hour

// catalogRetryBackoff spaces out retries after a failed pass, so a blip at boot costs
// minutes of stale text rather than a day. Past the last step it repeats that step until
// a pass comes back clean; CatalogSyncInterval still caps every wait.
var catalogRetryBackoff = []time.Duration{time.Minute, 5 * time.Minute, 30 * time.Minute}

// localeSyncTimeout bounds locale discovery and each language, so a hung upstream cannot
// stall the loop. A var so a test can shrink it.
var localeSyncTimeout = 2 * time.Minute

// RunCatalogSync imports every catalog exercise in English and then re-reads every held
// one in every other language the catalog offers, once at start and then every interval,
// sooner while a pass is failing. No request triggers it
// or waits on it; it blocks until ctx is done, so callers run it in a goroutine.
func (s *ExerciseStore) RunCatalogSync(ctx context.Context, every time.Duration) {
	if s.catalog == nil {
		return
	}
	failures := 0
	for {
		wait := every
		if _, err := s.syncCatalog(ctx); err != nil {
			wait = retryDelay(failures, every)
			failures++
			log.Printf("exercises: catalog sync incomplete, will try again in %s: %v", wait, err)
		} else {
			failures = 0
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

// retryDelay is the wait after the failures-th consecutive failed pass, never longer than
// the regular interval.
func retryDelay(failures int, every time.Duration) time.Duration {
	d := catalogRetryBackoff[min(failures, len(catalogRetryBackoff)-1)]
	return min(d, every)
}

// syncCatalog is the one catalog pass. English goes first, because it creates the rows
// every translation attaches to; the other languages follow. The int is how many
// exercises the English pass recorded. A language that fails does not stop the rest.
func (s *ExerciseStore) syncCatalog(ctx context.Context) (int, error) {
	if s.catalog == nil {
		return 0, ErrNoCatalog
	}
	if !s.syncing.CompareAndSwap(false, true) {
		return 0, ErrSyncRunning
	}
	defer s.syncing.Store(false)
	dctx, cancel := context.WithTimeout(ctx, localeSyncTimeout)
	codes, err := s.catalog.Revalidating().Locales(dctx)
	cancel()
	if err != nil {
		return 0, fmt.Errorf("%w: %w", ErrCatalogUnreachable, err)
	}
	seen := map[string]bool{}
	var locales []string
	for _, c := range codes {
		if l := NormalizeLocale(c); l != defaultLocale && !seen[l] {
			seen[l] = true
			locales = append(locales, l)
		}
	}
	// replaceTranslation for es-MX deletes the es row it falls back over, so every
	// regional tag must be synced before its base language.
	sort.Sort(sort.Reverse(sort.StringSlice(locales)))
	locales = append([]string{defaultLocale}, locales...)
	english := 0
	var errs []error
	for _, l := range locales {
		lctx, cancel := context.WithTimeout(ctx, localeSyncTimeout)
		n, err := s.refresh(lctx, l)
		cancel()
		if l == defaultLocale {
			english = n
		}
		if err != nil {
			errs = append(errs, err)
			log.Printf("exercises: catalog sync for %q failed after %d rows: %.200v", l, n, err)
			continue
		}
		log.Printf("exercises: synced %d exercises in %q", n, l)
	}
	if len(errs) > 0 {
		return english, fmt.Errorf("%d of %d languages did not sync: %w", len(errs), len(locales), errors.Join(errs...))
	}
	return english, nil
}

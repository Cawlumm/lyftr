package stores

import (
	"context"
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

// localeSyncTimeout bounds one language, so a hung upstream cannot stall the loop.
const localeSyncTimeout = 2 * time.Minute

// RunCatalogSync re-reads every held exercise in every language the catalog offers, once
// at start and then every interval, sooner while a pass is failing. No request triggers it
// or waits on it; it blocks until ctx is done, so callers run it in a goroutine.
func (s *ExerciseStore) RunCatalogSync(ctx context.Context, every time.Duration) {
	if s.catalog == nil {
		return
	}
	failures := 0
	for {
		wait := every
		if err := s.syncCatalog(ctx); err != nil {
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

func (s *ExerciseStore) syncCatalog(ctx context.Context) error {
	codes, err := s.catalog.Locales(ctx)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	var locales []string
	for _, c := range codes {
		if l := NormalizeLocale(c); !seen[l] {
			seen[l] = true
			locales = append(locales, l)
		}
	}
	// replaceTranslation for es-MX deletes the es row it falls back over, so every
	// regional tag must be synced before its base language.
	sort.Sort(sort.Reverse(sort.StringSlice(locales)))
	failed := 0
	for _, l := range locales {
		lctx, cancel := context.WithTimeout(ctx, localeSyncTimeout)
		n, err := s.refresh(lctx, l)
		cancel()
		if err != nil {
			failed++
			log.Printf("exercises: catalog sync for %q failed after %d rows: %.200v", l, n, err)
			continue
		}
		log.Printf("exercises: refreshed %d cached exercises in %q", n, l)
	}
	if failed > 0 {
		return fmt.Errorf("%d of %d languages did not sync", failed, len(locales))
	}
	return nil
}

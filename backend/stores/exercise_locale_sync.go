package stores

import (
	"context"
	"encoding/json"
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

const (
	syncFailureUnreachable = "unreachable"
	syncFailureOther       = "other"
)

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
		s.setNextAttempt(nil)
		wait := every
		if _, err := s.syncCatalog(ctx); err != nil {
			wait = retryDelay(failures, every)
			failures++
			log.Printf("exercises: catalog sync incomplete, will try again in %s: %v", wait, err)
		} else {
			failures = 0
		}
		next := time.Now().Add(wait).UTC()
		s.setNextAttempt(&next)
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

func (s *ExerciseStore) setNextAttempt(t *time.Time) {
	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	s.status.NextAttemptAt = t
}

// recordPass is the one place a finished pass is written to the status. A failed pass
// leaves LastSyncedAt at the last clean one.
func (s *ExerciseStore) recordPass(started time.Time, err error) {
	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	at := started.UTC()
	s.status.LastAttemptAt = &at
	if err == nil {
		now := time.Now().UTC()
		s.status.LastSyncedAt = &now
		s.status.LastFailure = nil
		return
	}
	reason := syncFailureOther
	if errors.Is(err, ErrCatalogUnreachable) {
		reason = syncFailureUnreachable
	}
	s.status.LastFailure = &reason
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
// After a discovery that listed languages, translations in languages no longer offered
// are deleted; a failed or empty discovery deletes nothing.
func (s *ExerciseStore) syncCatalog(ctx context.Context) (_ int, err error) {
	if s.catalog == nil {
		return 0, ErrNoCatalog
	}
	if !s.syncing.CompareAndSwap(false, true) {
		return 0, ErrSyncRunning
	}
	defer s.syncing.Store(false)
	started := time.Now()
	// Deferred after the flag's release, so it runs first: a reader never sees the pass
	// finished with the old outcome.
	defer func() { s.recordPass(started, err) }()
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
	var errs []error
	if len(codes) > 0 {
		offered := make([]string, 0, len(seen))
		for l := range seen {
			offered = append(offered, l)
		}
		if err := s.purgeDroppedLocales(offered); err != nil {
			errs = append(errs, err)
			log.Printf("exercises: purging dropped languages failed: %.200v", err)
		}
	}
	// replaceTranslation for es-MX deletes the es row it falls back over, so every
	// regional tag must be synced before its base language.
	sort.Sort(sort.Reverse(sort.StringSlice(locales)))
	locales = append([]string{defaultLocale}, locales...)
	english := 0
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

// purgeDroppedLocales deletes translations in languages oedb no longer offers. A locale
// stays if it is offered or is the base language of an offered one, because
// translationJoin falls back from es-MX to es. English lives in the base columns, not in
// this table, so it is never touched.
func (s *ExerciseStore) purgeDroppedLocales(offered []string) error {
	keep := make([]string, 0, 2*len(offered))
	for _, l := range offered {
		keep = append(keep, l, BaseLanguage(l))
	}
	keepJSON, err := json.Marshal(keep)
	if err != nil {
		return err
	}
	res, err := s.db.Exec(`DELETE FROM exercise_translations WHERE locale NOT IN (SELECT value FROM json_each(?))`, string(keepJSON))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("exercises: removed %d translations in languages the catalog no longer offers", n)
	}
	return nil
}

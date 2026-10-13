package stores

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"sync"
	"time"
)

// localeSyncTTL is how long a language counts as filled before the cache is read
// again. It bounds how long an upstream correction (a better Spanish name, a fixed
// step) takes to reach readers, without a request ever waiting on it.
const localeSyncTTL = 24 * time.Hour

// localeSyncTimeout bounds one pass. A pass is background work for a request that has
// already been answered, so it must not outlive a hung upstream.
const localeSyncTimeout = 2 * time.Minute

// localeSyncer keeps the cache filled for every language readers ask in. Nothing in
// it is specific to a language: a locale needs only to be a valid tag that oedb can
// serve, so adding Portuguese is a client and catalog change, not a change here.
type localeSyncer struct {
	mu       sync.Mutex
	inFlight map[string]bool
	now      func() time.Time
}

func newLocaleSyncer() *localeSyncer {
	return &localeSyncer{inFlight: map[string]bool{}, now: time.Now}
}

// SyncLocale fills the cache for locale if it has not been filled within the TTL, and
// returns without waiting: the pass runs in the background. English, an unreachable
// catalog and a fresh language are all no-ops, and concurrent callers for the same
// language share one pass. Failure is logged and leaves the language unmarked, so the
// next request tries again; it never reaches the reader.
func (s *ExerciseStore) SyncLocale(locale string) {
	locale = NormalizeLocale(locale)
	// By language, not tag: en-GB is English too, and oedb has nothing to add to it.
	if s.catalog == nil || BaseLanguage(locale) == defaultLocale {
		return
	}
	if !s.sync.begin(locale) {
		return
	}
	go func() {
		defer s.sync.end(locale)
		ctx, cancel := context.WithTimeout(context.Background(), localeSyncTimeout)
		defer cancel()
		if _, err := s.syncLocaleNow(ctx, locale); err != nil {
			log.Printf("exercises: locale sync for %q failed, will retry on the next request: %v", locale, err)
		}
	}()
}

// syncLocaleNow is the pass itself, synchronous so that tests and the admin endpoint
// can wait for it. It reports whether a fetch happened.
func (s *ExerciseStore) syncLocaleNow(ctx context.Context, locale string) (bool, error) {
	fresh, err := s.localeIsFresh(locale)
	if err != nil || fresh {
		return false, err
	}
	n, err := s.refresh(ctx, locale)
	if err != nil {
		return true, err
	}
	_, err = s.db.Exec(`
		INSERT INTO exercise_locale_sync (locale, synced_at, rows) VALUES (?, ?, ?)
		ON CONFLICT(locale) DO UPDATE SET synced_at = excluded.synced_at, rows = excluded.rows`,
		locale, s.sync.now().UTC(), n)
	return true, err
}

func (s *ExerciseStore) localeIsFresh(locale string) (bool, error) {
	var at time.Time
	err := s.db.QueryRow(`SELECT synced_at FROM exercise_locale_sync WHERE locale = ?`, locale).Scan(&at)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return s.sync.now().Sub(at) < localeSyncTTL, nil
}

// begin claims the language for one pass, reporting false if another is running.
func (l *localeSyncer) begin(locale string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.inFlight[locale] {
		return false
	}
	l.inFlight[locale] = true
	return true
}

func (l *localeSyncer) end(locale string) {
	l.mu.Lock()
	delete(l.inFlight, locale)
	l.mu.Unlock()
}

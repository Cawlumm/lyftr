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
	allowed  map[string]bool
	now      func() time.Time
}

func newLocaleSyncer() *localeSyncer {
	return &localeSyncer{inFlight: map[string]bool{}, allowed: map[string]bool{}, now: time.Now}
}

// SyncLocales sets the languages SyncLocale will fill. Anything else is ignored: a
// request can name any tag, and each language is a pass against the catalog.
func (s *ExerciseStore) SyncLocales(languages ...string) {
	s.sync.mu.Lock()
	defer s.sync.mu.Unlock()
	s.sync.allowed = map[string]bool{}
	for _, l := range languages {
		if l = BaseLanguage(NormalizeLocale(l)); l != defaultLocale {
			s.sync.allowed[l] = true
		}
	}
}

// SyncLocale fills the cache for the language of locale if it is one the operator
// listed and has not been filled within the TTL, and returns without waiting: the pass
// runs in the background. English, an unlisted language, an unreachable catalog and a
// fresh language are all no-ops, and concurrent callers share one pass. Failure is
// logged and leaves the language unmarked, so the next request tries again; it never
// reaches the reader.
//
// The unit is the language, not the tag: oedb falls es-MX back to es itself, and the
// store reads a regional request through the base-language rows, so es-MX and es-AR
// readers share the one pass instead of each costing the catalog nine requests.
func (s *ExerciseStore) SyncLocale(locale string) {
	locale = BaseLanguage(NormalizeLocale(locale))
	if s.catalog == nil || locale == defaultLocale || !s.sync.permits(locale) {
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

func (l *localeSyncer) permits(language string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.allowed[language]
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

func (l *localeSyncer) inFlightNow(language string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.inFlight[language]
}

func (l *localeSyncer) end(locale string) {
	l.mu.Lock()
	delete(l.inFlight, locale)
	l.mu.Unlock()
}

package stores

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"runtime/debug"
	"sort"
	"strings"
	"time"

	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/oedb"
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
// sooner while a pass is failing. A start within the interval of the last clean pass
// waits out the rest of it instead, so a restart loop is not a sync loop. No request
// triggers it or waits on it; it blocks until ctx is done, so callers run it in a goroutine.
func (s *ExerciseStore) RunCatalogSync(ctx context.Context, every time.Duration) {
	if s.catalog == nil {
		return
	}
	if err := s.loadSyncState(); err != nil {
		log.Printf("exercises: reading the last catalog pass failed, syncing now: %v", err)
	}
	s.statusMu.Lock()
	st := s.status
	s.statusMu.Unlock()
	if next, ok := bootSkip(st, s.catalogHeld(), time.Now(), every); ok {
		s.setNextAttempt(&next)
		log.Printf("exercises: catalog last synced at %s, next pass at %s", st.LastSyncedAt.Format(time.RFC3339), next.Format(time.RFC3339))
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
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

// bootSkip decides whether the first pass after a start can wait, and until when. Only a
// clean last pass inside the interval, over a catalog still held in English and at least
// one other language, may skip: never synced, failed, stale, a clock set back, or a
// stamp over an emptied catalog all sync now.
func bootSkip(st models.ExerciseCacheStatus, held bool, now time.Time, every time.Duration) (time.Time, bool) {
	if !held || st.LastSyncedAt == nil || st.LastFailure != nil {
		return time.Time{}, false
	}
	age := now.Sub(*st.LastSyncedAt)
	if age < 0 || age >= every {
		return time.Time{}, false
	}
	return st.LastSyncedAt.Add(every).UTC(), true
}

// catalogHeld reports whether this instance holds visible catalog rows and translations
// for them. A database error reads as not held, so the pass runs.
func (s *ExerciseStore) catalogHeld() bool {
	var held bool
	err := s.db.QueryRow(`SELECT
		EXISTS (SELECT 1 FROM exercises WHERE oedb_id IS NOT NULL AND upstream_missing_at IS NULL)
		AND EXISTS (SELECT 1 FROM exercise_translations)`).Scan(&held)
	return err == nil && held
}

// loadSyncState reads the last recorded pass into the status, so seed-status is truthful
// straight after a restart.
func (s *ExerciseStore) loadSyncState() error {
	var attempt string
	var synced, failure, source, generated, msource sql.NullString
	err := s.db.QueryRow(`SELECT last_attempt_at, last_synced_at, last_failure, catalog_source, catalog_generated_at, catalog_manifest_source FROM catalog_sync WHERE id = 1`).
		Scan(&attempt, &synced, &failure, &source, &generated, &msource)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	at, err := time.Parse(time.RFC3339Nano, attempt)
	if err != nil {
		return err
	}
	var syncedAt *time.Time
	if synced.Valid {
		t, err := time.Parse(time.RFC3339Nano, synced.String)
		if err != nil {
			return err
		}
		syncedAt = &t
	}
	var reason, src *string
	if failure.Valid {
		reason = &failure.String
	}
	if source.Valid {
		src = &source.String
	}
	var genAt *time.Time
	if generated.Valid {
		if t, err := time.Parse(time.RFC3339Nano, generated.String); err == nil {
			t = t.UTC()
			genAt = &t
		}
	}
	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	at = at.UTC()
	s.status.LastAttemptAt = &at
	s.status.LastSyncedAt = syncedAt
	s.status.LastFailure = reason
	s.status.CatalogSource = src
	s.status.CatalogGeneratedAt = genAt
	s.status.CatalogManifestSource = nil
	if msource.Valid {
		s.status.CatalogManifestSource = &msource.String
	}
	return nil
}

// passRecord is what a clean pass tells the status about the copy it applied.
type passRecord struct {
	source      string
	generatedAt *time.Time
	// manifestSource is the API base the snapshot was built from; set with generatedAt.
	manifestSource string
}

// (A nil generatedAt keeps the recorded one.)
//
// recordPass is the one place a finished pass is written to the status, in memory and in
// catalog_sync. A failed pass leaves LastSyncedAt, the source and its generated_at at the
// last clean one.
func (s *ExerciseStore) recordPass(started time.Time, err error, rec passRecord) {
	s.statusMu.Lock()
	at := started.UTC()
	s.status.LastAttemptAt = &at
	if err == nil {
		now := time.Now().UTC()
		s.status.LastSyncedAt = &now
		s.status.LastFailure = nil
		if rec.source != "" {
			src := rec.source
			s.status.CatalogSource = &src
			// Only a snapshot pass says when its copy was generated. An API pass leaves the
			// last snapshot's stamp alone: the API stamps build time, which would make every
			// good snapshot look older than what is applied.
			if rec.generatedAt != nil {
				s.status.CatalogGeneratedAt = rec.generatedAt
				ms := rec.manifestSource
				s.status.CatalogManifestSource = &ms
			}
		}
	} else {
		reason := syncFailureOther
		if errors.Is(err, ErrCatalogUnreachable) {
			reason = syncFailureUnreachable
		}
		s.status.LastFailure = &reason
	}
	st := s.status
	s.statusMu.Unlock()
	// Losing this write costs one extra pass at the next start, never a skipped one: the
	// row it would replace is older.
	if perr := s.persistSyncState(st); perr != nil {
		log.Printf("exercises: recording the catalog pass failed: %v", perr)
	}
}

func (s *ExerciseStore) persistSyncState(st models.ExerciseCacheStatus) error {
	// A store with no database (a test inducing a panic) has nowhere to write.
	if s.db == nil {
		return nil
	}
	var synced any
	if st.LastSyncedAt != nil {
		synced = st.LastSyncedAt.Format(time.RFC3339Nano)
	}
	var generated any
	if st.CatalogGeneratedAt != nil {
		generated = st.CatalogGeneratedAt.UTC().Format(time.RFC3339Nano)
	}
	_, err := s.db.Exec(`INSERT INTO catalog_sync (id, last_attempt_at, last_synced_at, last_failure, catalog_source, catalog_generated_at, catalog_manifest_source)
		VALUES (1, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at,
			last_synced_at = excluded.last_synced_at, last_failure = excluded.last_failure,
			catalog_source = excluded.catalog_source, catalog_generated_at = excluded.catalog_generated_at,
			catalog_manifest_source = excluded.catalog_manifest_source`,
		st.LastAttemptAt.Format(time.RFC3339Nano), synced, st.LastFailure, st.CatalogSource, generated, st.CatalogManifestSource)
	return err
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
func (s *ExerciseStore) syncCatalog(ctx context.Context) (int, error) {
	return s.syncCatalogWith(ctx, false)
}

// syncCatalogWith is syncCatalog with the shrink guard optionally lifted for this pass.
func (s *ExerciseStore) syncCatalogWith(ctx context.Context, acceptShrink bool) (_ int, err error) {
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
	var rec passRecord
	defer func() { s.recordPass(started, err, rec) }()
	// Runs before recordPass, so a panic is recorded as the failed pass it was, and the
	// scheduler goroutine survives to retry instead of taking the whole server down.
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("catalog sync panicked: %v", r)
			log.Printf("exercises: %v\n%s", err, debug.Stack())
		}
	}()
	snap := s.loadSnapshot(ctx)
	var codes []string
	switch {
	case snap != nil && snap.Unchanged:
		gen := snap.GeneratedAt
		rec = passRecord{source: snapshotSource(snap), generatedAt: &gen, manifestSource: snap.Source}
		held, _ := s.cachedOedbIDs()
		log.Printf("exercises: snapshot generated %s is the one already applied; nothing to import", gen.Format(time.RFC3339))
		return len(held), nil
	case snap != nil:
		gen := snap.GeneratedAt
		rec = passRecord{source: snapshotSource(snap), generatedAt: &gen, manifestSource: snap.Source}
		codes = snap.Locales
	default:
		rec = passRecord{source: sourceAPI}
		dctx, cancel := context.WithTimeout(ctx, localeSyncTimeout)
		codes, err = s.catalog.Revalidating().Locales(dctx)
		cancel()
		if err != nil {
			return 0, fmt.Errorf("%w: %w", ErrCatalogUnreachable, err)
		}
	}
	seen := map[string]bool{}
	var locales []string
	for _, c := range codes {
		if l := NormalizeLocale(c); l != defaultLocale && !seen[l] {
			seen[l] = true
			locales = append(locales, l)
			if snap != nil {
				snap.alias[l] = c
			}
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
		n, err := s.refreshFrom(lctx, l, acceptShrink, snap)
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
//
// A discovery answer is upstream's word alone, and a wrong or truncated one would read as
// "every language was dropped". When it would remove more than half of the languages held,
// nothing is deleted: leftover translations are harmless, wiping them costs a full re-import.
func (s *ExerciseStore) purgeDroppedLocales(offered []string) error {
	keep := make([]string, 0, 2*len(offered))
	for _, l := range offered {
		keep = append(keep, l, BaseLanguage(l))
	}
	keepJSON, err := json.Marshal(keep)
	if err != nil {
		return err
	}
	var held, dropped int
	if err := s.db.QueryRow(`SELECT COUNT(DISTINCT locale),
		COUNT(DISTINCT CASE WHEN locale NOT IN (SELECT value FROM json_each(?1)) THEN locale END)
		FROM exercise_translations`, string(keepJSON)).Scan(&held, &dropped); err != nil {
		return err
	}
	if dropped*2 > held {
		log.Printf("exercises: catalog now offers %d languages and would drop %d of the %d held; keeping their translations", len(offered), dropped, held)
		return nil
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

const sourceAPI = "api"

// maxSnapshotAge is how old a snapshot may be and still be believed: the publisher runs
// every six hours, so older means it has stopped, and the API is the better source.
var maxSnapshotAge = 48 * time.Hour

// maxSnapshotSkew is how far ahead of this clock a manifest may claim to be.
const maxSnapshotSkew = 10 * time.Minute

// snapshotPass is a validated snapshot a pass imports from.
type snapshotPass struct {
	*oedb.LoadedSnapshot
	// alias maps a normalized locale to the code the manifest spelled it with.
	alias map[string]string
}

func (p *snapshotPass) items(locale string) []oedb.Exercise {
	if c, ok := p.alias[locale]; ok {
		return p.Exercises[c]
	}
	return p.Exercises[locale]
}

func snapshotSource(p *snapshotPass) string { return "snapshot:" + p.URL }

// loadSnapshot reads the configured snapshots and returns the first that validates, or nil
// when none is configured or usable; every fallback to the API is logged with its reason.
// Only loading and validation can fall back: once a snapshot is chosen, an import error is
// the pass's error, as it would be from the API.
func (s *ExerciseStore) loadSnapshot(ctx context.Context) *snapshotPass {
	if s.snapshot == nil {
		return nil
	}
	lctx, cancel := context.WithTimeout(ctx, localeSyncTimeout)
	defer cancel()
	got, err := s.snapshot.Load(lctx, s.snapshotAccept)
	if err != nil {
		log.Printf("exercises: catalog snapshot not used, reading the API instead: %v", err)
		return nil
	}
	return &snapshotPass{LoadedSnapshot: got, alias: map[string]string{}}
}

// snapshotAccept refuses a manifest that is too old, or older than the copy already
// applied, so a stalled or rolled-back publisher cannot freeze or rewind an install. A
// manifest equal to the copy the last clean pass applied from a snapshot needs no import.
func (s *ExerciseStore) snapshotAccept(m oedb.Manifest) error {
	// The heartbeat, not the content version: an unchanged catalog keeps an old
	// generated_at for as long as it likes while the publisher is alive.
	now := time.Now()
	if age := now.Sub(m.Published()); age > maxSnapshotAge {
		return fmt.Errorf("published %s ago, older than %s", age.Round(time.Minute), maxSnapshotAge)
	}
	// A clock set wrong on the publisher must not pin the install to a stamp nothing newer can beat.
	if m.GeneratedAt.After(now.Add(maxSnapshotSkew)) || m.Published().After(now.Add(maxSnapshotSkew)) {
		return fmt.Errorf("generated %s, published %s: in the future", m.GeneratedAt.Format(time.RFC3339), m.Published().Format(time.RFC3339))
	}
	s.statusMu.Lock()
	st := s.status
	s.statusMu.Unlock()
	// A stamp means something only against a manifest of the same catalog: one built
	// from a different API (OEDB_CATALOG_URLS changed) is accepted and imported.
	if st.CatalogGeneratedAt == nil || st.CatalogManifestSource == nil || *st.CatalogManifestSource != m.Source {
		return nil
	}
	rec := *st.CatalogGeneratedAt
	if m.GeneratedAt.Before(rec) {
		return fmt.Errorf("generated %s, older than the %s already applied", m.GeneratedAt.Format(time.RFC3339), rec.Format(time.RFC3339))
	}
	if m.GeneratedAt.Equal(rec) && st.LastFailure == nil && st.LastSyncedAt != nil &&
		st.CatalogSource != nil && strings.HasPrefix(*st.CatalogSource, "snapshot:") && s.catalogHeld() {
		return oedb.ErrSnapshotUnchanged
	}
	return nil
}

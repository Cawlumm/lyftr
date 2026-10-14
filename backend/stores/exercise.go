package stores

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/oedb"
	"github.com/Cawlumm/lyftr-backend/utils"
)

// ExerciseStore owns all SQL for the (global, read-only) exercises catalog, and
// wraps the seed subsystem for the admin sync/reset endpoints.
type ExerciseStore struct {
	db      *sql.DB
	catalog *oedb.Client
}

func NewExerciseStore(db *sql.DB) *ExerciseStore { return &ExerciseStore{db: db} }

// ExerciseFilter holds the optional list filters (empty string = no filter).
type ExerciseFilter struct {
	Query, MuscleGroup, Category, Equipment string
	// Locale is the reader's language. Empty and malformed values mean English.
	Locale string
	Limit  int
	// Page is 1-based; zero and one both mean the first page. Paging is what lets
	// the pickers stop downloading the catalog to filter it in the browser.
	Page int
}

// offset converts the 1-based page into a SQL offset.
func (f ExerciseFilter) offset() int {
	if f.Page < 2 {
		return 0
	}
	return (f.Page - 1) * f.Limit
}

const defaultLocale = "en"

// NormalizeLocale is the one spelling of a locale: language lowercase, everything
// after the first '-' uppercase, as oedb's normalizeLocale writes it, because the
// rows stored here carry oedb's spelling. Empty or malformed input is English, the
// documented meaning of "no usable locale" rather than an error.
func NormalizeLocale(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) > 35 {
		return defaultLocale
	}
	subtags := strings.Split(raw, "-")
	for i, tag := range subtags {
		if tag == "" {
			return defaultLocale
		}
		for j := 0; j < len(tag); j++ {
			c := tag[j]
			isLetter := c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
			if !isLetter && (i == 0 || c < '0' || c > '9') {
				return defaultLocale
			}
		}
	}
	if n := len(subtags[0]); n < 2 || n > 8 {
		return defaultLocale
	}
	subtags[0] = strings.ToLower(subtags[0])
	for i := 1; i < len(subtags); i++ {
		subtags[i] = strings.ToUpper(subtags[i])
	}
	return strings.Join(subtags, "-")
}

// BaseLanguage is the language subtag of a normalized locale: es for es-MX.
func BaseLanguage(locale string) string {
	if i := strings.IndexByte(locale, '-'); i > 0 {
		return locale[:i]
	}
	return locale
}

// Which text an exercise shows is decided here and nowhere else: the reader's
// locale, then its base language, then the English base row, field by field. Every
// read that returns exercise text joins through translationJoin and selects
// localizedName / localizedDescription.
const (
	localizedName        = `COALESCE(NULLIF(tr.name, ''), e.name)`
	localizedDescription = `COALESCE(NULLIF(tr.description, ''), e.description)`
)

// translationJoin returns a LEFT JOIN, aliased tr, onto the single best translation
// row for each exercise e. English reads join nothing: the base row is English.
func translationJoin(locale string) (string, []any) {
	l := NormalizeLocale(locale)
	if l == defaultLocale {
		return ` LEFT JOIN exercise_translations tr ON 1 = 0`, nil
	}
	return ` LEFT JOIN exercise_translations tr ON tr.id = (
		SELECT t.id FROM exercise_translations t
		WHERE t.exercise_id = e.id AND t.locale IN (?, ?)
		ORDER BY t.locale = ? DESC LIMIT 1)`, []any{l, BaseLanguage(l), l}
}

func exerciseSelect(locale string) (string, []any) {
	join, args := translationJoin(locale)
	return `SELECT e.id, ` + localizedName + `, e.muscle_group, e.secondary_muscles, e.category, e.equipment, ` +
		localizedDescription + `, e.image_url FROM exercises e` + join, args
}

type scanner interface{ Scan(dest ...any) error }

func scanExercise(row scanner, e *models.Exercise) error {
	var secondaryRaw string
	if err := row.Scan(&e.ID, &e.Name, &e.MuscleGroup, &secondaryRaw, &e.Category, &e.Equipment, &e.Description, &e.ImageURL); err != nil {
		return err
	}
	json.Unmarshal([]byte(secondaryRaw), &e.SecondaryMuscles)
	if e.SecondaryMuscles == nil {
		e.SecondaryMuscles = []string{}
	}
	return nil
}

func (s *ExerciseStore) List(f ExerciseFilter) ([]models.Exercise, error) {
	locale := NormalizeLocale(f.Locale)
	sel, args := exerciseSelect(locale)
	q := sel + ` WHERE 1=1`
	if f.Query != "" {
		like := "%" + f.Query + "%"
		q += " AND (e.name LIKE ? OR EXISTS (SELECT 1 FROM exercise_translations t WHERE t.exercise_id = e.id AND t.locale IN (?, ?) AND t.name LIKE ?))"
		args = append(args, like, locale, BaseLanguage(locale), like)
	}
	if f.MuscleGroup != "" {
		q += " AND e.muscle_group = ?"
		args = append(args, f.MuscleGroup)
	}
	if f.Category != "" {
		q += " AND e.category = ?"
		args = append(args, f.Category)
	}
	if f.Equipment != "" {
		q += " AND e.equipment = ?"
		args = append(args, f.Equipment)
	}
	q += " ORDER BY " + localizedName + " LIMIT ? OFFSET ?"
	args = append(args, f.Limit, f.offset())

	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	exercises := []models.Exercise{}
	for rows.Next() {
		var e models.Exercise
		if err := scanExercise(rows, &e); err != nil {
			return nil, err
		}
		exercises = append(exercises, e)
	}
	return exercises, rows.Err()
}

// Get returns one exercise, or sql.ErrNoRows if not found.
func (s *ExerciseStore) Get(id int64, locale string) (models.Exercise, error) {
	var e models.Exercise
	sel, args := exerciseSelect(locale)
	if err := scanExercise(s.db.QueryRow(sel+` WHERE e.id = ?`, append(args, id)...), &e); err != nil {
		return models.Exercise{}, err
	}
	return e, nil
}

func (s *ExerciseStore) Count() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM exercises`).Scan(&n)
	return n, err
}

// Materialize records upstream catalog rows in the local exercises table and
// returns them as Lyftr exercises, each carrying its local integer id.
//
// This is what lets Lyftr query oedb live while keeping referential integrity.
// workout_exercises and program_exercises FK into exercises(id) with no cascade,
// so an exercise a user can see in the picker must already exist locally by the
// time they add it to a workout — otherwise the insert fails, or worse, succeeds
// against an id that means something else. Materializing on read closes that gap
// without a second round trip when the user picks.
//
// Rows are matched by oedb_id first and name second. The order matters: name is
// the only key legacy rows have (they predate oedb entirely and were seeded from
// free-exercise-db), while oedb_id is the only key that survives an upstream
// rename. Trying oedb_id first means a renamed exercise updates the row it
// already owns instead of inserting a duplicate under the new name.
//
// The base row is English and stays English. Each field oedb served in English
// goes into it; each field served in another language goes into that locale's
// exercise_translations row instead, so one user's Spanish search never rewrites
// what an English reader sees. locale is the language that was asked for, and the
// language the returned rows are shown in.
//
// Name matching only adopts a row that no upstream id owns yet. An upstream
// exercise whose name is already owned by another id, or that arrives translated
// with no English row to attach to, is skipped and left out of the result, because oedb names are not unique and re-pointing the row would re-point
// every workout that references it.
func (s *ExerciseStore) Materialize(items []oedb.Exercise, imageBase, locale string) ([]models.Exercise, error) {
	if len(items) == 0 {
		return []models.Exercise{}, nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	locale = NormalizeLocale(locale)
	sel, selArgs := exerciseSelect(locale)

	byOedbID, err := tx.Prepare(`
		UPDATE exercises SET
		  name = COALESCE(?, name), muscle_group = ?, secondary_muscles = ?, category = ?,
		  equipment = ?, description = COALESCE(?, description), image_url = ?, slug = ?
		WHERE oedb_id = ?`)
	if err != nil {
		return nil, err
	}
	defer byOedbID.Close()

	byName, err := tx.Prepare(`
		INSERT INTO exercises (name, muscle_group, secondary_muscles, category, equipment, description, image_url, oedb_id, slug)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(name) DO UPDATE SET
		  muscle_group      = excluded.muscle_group,
		  secondary_muscles = excluded.secondary_muscles,
		  category          = excluded.category,
		  equipment         = excluded.equipment,
		  description       = COALESCE(?, description),
		  image_url         = excluded.image_url,
		  oedb_id           = excluded.oedb_id,
		  slug              = excluded.slug
		WHERE exercises.oedb_id IS NULL`)
	if err != nil {
		return nil, err
	}
	defer byName.Close()

	out := make([]models.Exercise, 0, len(items))
	for _, it := range items {
		secondary := it.SecondaryMuscles
		if secondary == nil {
			secondary = []string{}
		}
		secondaryJSON, err := json.Marshal(secondary)
		if err != nil {
			return nil, err
		}

		name, desc := it.Name(), it.Description()
		nameEN := servedInEnglish(it.Translation.NameLocale)
		descEN := servedInEnglish(it.Translation.InstructionsLocale)
		// nil leaves the base column alone: a field served in another language is
		// not the English text this column holds.
		var nameEnglish, descEnglish any
		if nameEN {
			nameEnglish = name
		}
		if descEN {
			descEnglish = desc
		}

		args := []any{
			nameEnglish, it.MuscleGroup, string(secondaryJSON), it.Category,
			it.Equipment, descEnglish, it.ImageURL(imageBase), it.Slug, it.ID,
		}
		res, err := byOedbID.Exec(args...)
		if utils.IsUniqueViolation(err) {
			// Moving the name would mean merging two rows that workouts point at.
			holderID, holderOedb, herr := nameHolder(tx, name)
			if herr != nil {
				return nil, herr
			}
			log.Printf("exercises: upstream %s renamed to %q, already held by local exercise %d (oedb_id %q); keeping its current name", it.ID, name, holderID, holderOedb)
			args[0] = nil
			res, err = byOedbID.Exec(args...)
		}
		if err != nil {
			return nil, err
		}
		n, err := res.RowsAffected()
		if err != nil {
			return nil, err
		}
		if n == 0 {
			if !nameEN {
				// No English row to hang the translation on, and none to invent: either
				// the English read skipped this exercise (its name is held by another
				// id) or oedb did not return it. Leave it out; the rest of the batch stands.
				log.Printf("exercises: skipping upstream %s: no English base row for its %s translation", it.ID, locale)
				continue
			}
			baseDesc := ""
			if descEN {
				baseDesc = desc
			}
			nameRes, err := byName.Exec(
				name, it.MuscleGroup, string(secondaryJSON), it.Category,
				it.Equipment, baseDesc, it.ImageURL(imageBase), it.ID, it.Slug,
				descEnglish,
			)
			if err != nil {
				return nil, err
			}
			adopted, err := nameRes.RowsAffected()
			if err != nil {
				return nil, err
			}
			if adopted == 0 {
				holderID, holderOedb, herr := nameHolder(tx, name)
				if herr != nil {
					return nil, herr
				}
				log.Printf("exercises: skipping upstream %s %q: name already held by local exercise %d (oedb_id %q)", it.ID, name, holderID, holderOedb)
				continue
			}
		}

		if locale != defaultLocale {
			if err := replaceTranslation(tx, it, locale, nameEN, descEN); err != nil {
				return nil, err
			}
		}

		var e models.Exercise
		row := tx.QueryRow(sel+` WHERE e.oedb_id = ?`, append(append([]any{}, selArgs...), it.ID)...)
		if err := scanExercise(row, &e); err != nil {
			return nil, err
		}
		out = append(out, e)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return out, nil
}

// nameHolder reports which local row holds name, for the log line when an upstream exercise cannot take it.
func nameHolder(tx *sql.Tx, name string) (id int64, oedbID string, err error) {
	err = tx.QueryRow(`SELECT id, COALESCE(oedb_id, '') FROM exercises WHERE name = ?`, name).Scan(&id, &oedbID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", nil
	}
	return
}

// servedInEnglish reports whether a field oedb served is the English text. An empty
// locale is an oedb that predates name_locale, which only ever served English.
func servedInEnglish(served string) bool { return NormalizeLocale(served) == defaultLocale }

// replaceTranslation records what oedb served for the requested locale. It drops
// the rows for the requested locale and its base language first, so a translation
// upstream has since dropped (a new revision does that) stops being shown, then
// writes one row if any field really was served in another language. A field that
// fell back to English is stored empty so the read falls through to the base row.
func replaceTranslation(tx *sql.Tx, it oedb.Exercise, locale string, nameEN, descEN bool) error {
	var exerciseID int64
	if err := tx.QueryRow(`SELECT id FROM exercises WHERE oedb_id = ?`, it.ID).Scan(&exerciseID); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`DELETE FROM exercise_translations WHERE exercise_id = ? AND locale IN (?, ?)`,
		exerciseID, locale, BaseLanguage(locale),
	); err != nil {
		return err
	}
	if nameEN && descEN {
		return nil
	}

	served, name, desc, origin := NormalizeLocale(it.Translation.NameLocale), "", "", "human"
	if nameEN {
		served = NormalizeLocale(it.Translation.InstructionsLocale)
	} else {
		name = it.Name()
		if it.Translation.NameMachineOrigin {
			origin = "machine"
		}
	}
	if !descEN {
		desc = it.Description()
		if it.Translation.InstructionsMachineOrigin {
			origin = "machine"
		}
	}
	_, err := tx.Exec(
		`INSERT INTO exercise_translations (exercise_id, locale, name, description, origin)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(exercise_id, locale) DO UPDATE SET
		   name = excluded.name, description = excluded.description, origin = excluded.origin`,
		exerciseID, served, name, desc, origin,
	)
	return err
}

// UseCatalog points this store at an upstream open-exercise-db instance.
//
// Optional by design: with no catalog the store answers from the local table
// alone, which is both the pre-oedb behaviour and the behaviour every test
// exercises. Nothing in Lyftr requires the network to work.
func (s *ExerciseStore) UseCatalog(c *oedb.Client) { s.catalog = c }

// Search answers an exercise query from the upstream catalog, recording what it
// returns locally, and falls back to the local table when the catalog cannot be
// reached.
//
// The fallback is not a nicety. oedb being down, slow, or rate-limiting must
// never stop someone logging a workout, and the local table already holds every
// exercise this instance has shown before — which, for an established install,
// is most of the ones its users search for.
func (s *ExerciseStore) Search(ctx context.Context, f ExerciseFilter) ([]models.Exercise, error) {
	if s.catalog == nil {
		return s.List(f)
	}

	items, err := s.fetchCatalog(ctx, f)
	if err != nil {
		log.Printf("exercises: catalog query failed, serving local snapshot: %v", err)
		return s.List(f)
	}

	if err := s.ensureEnglishBase(ctx, items); err != nil {
		log.Printf("exercises: could not fetch English base rows, serving local snapshot: %v", err)
		return s.List(f)
	}

	out, err := s.Materialize(items, s.catalog.BaseURL(), f.Locale)
	if err != nil {
		log.Printf("exercises: could not record catalog results, serving local snapshot: %v", err)
		return s.List(f)
	}
	return out, nil
}

// ensureEnglishBase records the English row of any exercise that arrived with a
// translated name and is not held locally yet. Materialize refuses to invent an
// English base from translated text, so this has to happen first: the exercises are
// re-read by id with no locale, which is the only way to learn their English name.
func (s *ExerciseStore) ensureEnglishBase(ctx context.Context, items []oedb.Exercise) error {
	var missing []string
	for _, it := range items {
		if servedInEnglish(it.Translation.NameLocale) {
			continue
		}
		var held int
		err := s.db.QueryRow(`SELECT COUNT(*) FROM exercises WHERE oedb_id = ?`, it.ID).Scan(&held)
		if err != nil {
			return err
		}
		if held == 0 {
			missing = append(missing, it.ID)
		}
	}
	if len(missing) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	for len(missing) > 0 {
		batch := missing[:min(len(missing), 100)]
		missing = missing[len(batch):]
		res, err := s.catalog.List(ctx, oedb.ListParams{IDs: batch, PerPage: len(batch)})
		if err != nil {
			return err
		}
		wanted := make(map[string]bool, len(batch))
		for _, id := range batch {
			wanted[id] = true
		}
		english := res.Exercises[:0]
		for _, it := range res.Exercises {
			if wanted[it.ID] {
				english = append(english, it)
			}
		}
		if _, err := s.Materialize(english, s.catalog.BaseURL(), defaultLocale); err != nil {
			return err
		}
	}
	return nil
}

// fetchCatalog picks between the paged endpoint and the bulk export.
//
// The picker asks for the whole catalog (limit=1000) to build its client-side
// cache, and oedb rejects per_page above 100 outright rather than clamping it.
// Rather than issue nine paged requests for that case, an unfiltered bulk read
// goes to the export endpoint, which returns everything at once. Anything
// filtered stays on List, where the filter is what keeps the response small.
func (s *ExerciseStore) fetchCatalog(ctx context.Context, f ExerciseFilter) ([]oedb.Exercise, error) {
	filtered := f.Query != "" || f.MuscleGroup != "" || f.Category != "" || f.Equipment != ""
	// The export takes no locale, so only an English read may use it. English is
	// sent as "" so its upstream URLs, and cache entries, are the same as before.
	locale := NormalizeLocale(f.Locale)
	if locale == defaultLocale {
		locale = ""
	}
	if !filtered && f.Limit > 100 && f.Page < 2 && locale == "" {
		// The export is ~300 KB and measured around 14s against the hosted
		// instance, so it gets a deadline sized for that. It is also cached
		// upstream-style for 900s, so only the first caller after a cold start
		// waits at all.
		ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
		defer cancel()
		return s.catalog.Export(ctx)
	}

	// An interactive search gets a short deadline: a picker that hangs is worse
	// than one that falls back to the local snapshot immediately.
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	// A filtered request for more than one page walks the pages. oedb caps
	// per_page at 100, so without this a caller asking for 1000 dumbbell
	// exercises would silently receive the first 100 and no indication that more
	// existed — which is what the local table used to answer in full.
	first := f.Page
	if first < 1 {
		first = 1
	}
	var out []oedb.Exercise
	for page := first; ; page++ {
		res, err := s.catalog.List(ctx, oedb.ListParams{
			Query:       f.Query,
			MuscleGroup: f.MuscleGroup,
			Category:    f.Category,
			Equipment:   f.Equipment,
			Locale:      locale,
			Page:        page,
			PerPage:     f.Limit - len(out),
		})
		if err != nil {
			return nil, err
		}
		out = append(out, res.Exercises...)
		if len(out) >= f.Limit || len(res.Exercises) == 0 {
			return out, nil
		}
		// res.Total counts the whole result set, not the remainder, so it only
		// terminates the walk once this page's offset has consumed it.
		if (page-first+1)*len(res.Exercises) >= res.Total {
			return out, nil
		}
	}
}

// with no upstream configured.
var errNoCatalog = errors.New("This server has no exercise catalog configured.")

// ErrNoCatalog is returned by the cache-management operations on an instance with
// no upstream configured.
var ErrNoCatalog = errors.New("This server has no exercise catalog configured.")

// CachedCount reports how many catalog rows this instance currently holds.
//
// Lyftr does not maintain a copy of the catalog, so this is not "how big is the
// exercise library" — it is how much of open-exercise-db this instance has had
// reason to look at. A fresh install reports zero and is fully functional.
func (s *ExerciseStore) CachedCount() (int, error) { return s.Count() }

// RefreshCached re-reads the rows this instance already holds and applies any
// upstream edits, returning how many were refreshed.
//
// Deliberately scoped to rows already present: it picks up corrections made
// upstream without importing the catalog. New exercises arrive the same way every
// other row did — the first time someone's search returns one.
//
// It reads the bulk export and intersects locally rather than fetching each row
// by id, because oedb has no batch-by-ids endpoint: refreshing 873 rows one at a
// time would be 873 requests against a 60/minute limit, or about a quarter hour.
func (s *ExerciseStore) RefreshCached(ctx context.Context) (int, error) {
	return s.refresh(ctx, defaultLocale)
}

// refresh re-reads every held row in one language. English comes from the bulk
// export; any other language is read by id in oedb's batch size, because the export
// is English-only and a list call is the only way to ask for a translation. One code
// path serves every language, so adding a locale needs no new fetching logic.
//
// It stops at the first failed batch and reports how many rows it did apply: the
// rows written so far are valid, and the caller decides whether a partial pass counts.
func (s *ExerciseStore) refresh(ctx context.Context, locale string) (int, error) {
	if s.catalog == nil {
		return 0, ErrNoCatalog
	}

	held, err := s.cachedOedbIDs()
	if err != nil {
		return 0, err
	}
	if len(held) == 0 {
		return 0, nil
	}

	if servedInEnglish(locale) {
		items, err := s.catalog.Export(ctx)
		if err != nil {
			return 0, err
		}
		keep := items[:0]
		for _, it := range items {
			if held[it.ID] {
				keep = append(keep, it)
			}
		}
		out, err := s.Materialize(keep, s.catalog.BaseURL(), defaultLocale)
		return len(out), err
	}

	ids := make([]string, 0, len(held))
	for id := range held {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	done := 0
	for start := 0; start < len(ids); start += oedb.MaxPerPage {
		end := min(start+oedb.MaxPerPage, len(ids))
		res, err := s.catalog.List(ctx, oedb.ListParams{IDs: ids[start:end], Locale: locale, PerPage: oedb.MaxPerPage})
		if err != nil {
			return done, err
		}
		out, err := s.Materialize(res.Exercises, s.catalog.BaseURL(), locale)
		if err != nil {
			return done, err
		}
		done += len(out)
	}
	return done, nil
}

func (s *ExerciseStore) cachedOedbIDs() (map[string]bool, error) {
	rows, err := s.db.Query(`SELECT oedb_id FROM exercises WHERE oedb_id IS NOT NULL AND oedb_id != ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	held := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		held[id] = true
	}
	return held, rows.Err()
}

// ClearUnreferenced drops cached rows no workout or program points at, returning
// how many went.
//
// Referenced rows are left alone rather than the whole table being emptied:
// workout_exercises and program_exercises FK into exercises(id) with no cascade,
// so deleting a referenced row is (correctly) refused by SQLite and would take a
// user's logged history with it if it were not.
func (s *ExerciseStore) ClearUnreferenced() (int, error) {
	res, err := s.db.Exec(`DELETE FROM exercises
		WHERE id NOT IN (SELECT exercise_id FROM workout_exercises)
		  AND id NOT IN (SELECT exercise_id FROM program_exercises)`)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

// PrimeQuery materializes whatever the catalog returns for one search term.
//
// This is how a caller that needs specific exercises to exist locally — demo data
// building a routine, say — gets them, without anything importing the catalog
// wholesale.
func (s *ExerciseStore) PrimeQuery(ctx context.Context, query string) error {
	if s.catalog == nil {
		return ErrNoCatalog
	}
	_, err := s.Search(ctx, ExerciseFilter{Query: query, Limit: 25})
	return err
}

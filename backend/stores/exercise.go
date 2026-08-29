package stores

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/Cawlumm/lyftr-backend/oedb"
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
	Limit                                   int
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

const exerciseSelect = `SELECT id, name, muscle_group, secondary_muscles, category, equipment, description, image_url FROM exercises`

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
	q := exerciseSelect + ` WHERE 1=1`
	args := []any{}
	if f.Query != "" {
		q += " AND name LIKE ?"
		args = append(args, "%"+f.Query+"%")
	}
	if f.MuscleGroup != "" {
		q += " AND muscle_group = ?"
		args = append(args, f.MuscleGroup)
	}
	if f.Category != "" {
		q += " AND category = ?"
		args = append(args, f.Category)
	}
	if f.Equipment != "" {
		q += " AND equipment = ?"
		args = append(args, f.Equipment)
	}
	q += " ORDER BY name LIMIT ? OFFSET ?"
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
func (s *ExerciseStore) Get(id int64) (models.Exercise, error) {
	var e models.Exercise
	if err := scanExercise(s.db.QueryRow(exerciseSelect+` WHERE id = ?`, id), &e); err != nil {
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
func (s *ExerciseStore) Materialize(items []oedb.Exercise, imageBase string) ([]models.Exercise, error) {
	if len(items) == 0 {
		return []models.Exercise{}, nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	byOedbID, err := tx.Prepare(`
		UPDATE exercises SET
		  name = ?, muscle_group = ?, secondary_muscles = ?, category = ?,
		  equipment = ?, description = ?, image_url = ?, slug = ?
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
		  description       = excluded.description,
		  image_url         = excluded.image_url,
		  oedb_id           = excluded.oedb_id,
		  slug              = excluded.slug`)
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

		name := it.Name()
		args := []any{
			name, it.MuscleGroup, string(secondaryJSON), it.Category,
			it.Equipment, it.Description(), it.ImageURL(imageBase), it.Slug,
		}

		res, err := byOedbID.Exec(append(append([]any{}, args...), it.ID)...)
		if err != nil {
			return nil, err
		}
		n, err := res.RowsAffected()
		if err != nil {
			return nil, err
		}
		if n == 0 {
			insertArgs := []any{
				name, it.MuscleGroup, string(secondaryJSON), it.Category,
				it.Equipment, it.Description(), it.ImageURL(imageBase), it.ID, it.Slug,
			}
			if _, err := byName.Exec(insertArgs...); err != nil {
				return nil, err
			}
		}

		var e models.Exercise
		row := tx.QueryRow(exerciseSelect+` WHERE oedb_id = ?`, it.ID)
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

	out, err := s.Materialize(items, s.catalog.BaseURL())
	if err != nil {
		log.Printf("exercises: could not record catalog results, serving local snapshot: %v", err)
		return s.List(f)
	}
	return out, nil
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
	if !filtered && f.Limit > 100 && f.Page < 2 {
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
// It asks for exactly the rows it holds, in batches of a hundred. This used to
// read the whole export and intersect locally, because oedb had no way to fetch
// a named set — so refreshing thirty exercises cost a 300 KB response, and the
// only alternative was one request per row against a per-minute limit.
func (s *ExerciseStore) RefreshCached(ctx context.Context) (int, error) {
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

	items, err := s.catalog.ListByIDs(ctx, held)
	if err != nil {
		return 0, err
	}

	out, err := s.Materialize(items, s.catalog.BaseURL())
	if err != nil {
		return 0, err
	}
	return len(out), nil
}

func (s *ExerciseStore) cachedOedbIDs() ([]string, error) {
	rows, err := s.db.Query(`SELECT oedb_id FROM exercises WHERE oedb_id IS NOT NULL AND oedb_id != ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var held []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		held = append(held, id)
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

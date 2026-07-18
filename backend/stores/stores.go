// Package stores holds the repository layer: each entity has a store that owns
// ALL of its SQL. Controllers depend on these via *Stores (constructor-injected)
// and never touch the database directly. Stores are transport-agnostic — they
// return models + raw errors and import neither gin nor the utils HTTP helpers.
package stores

import "database/sql"

// Stores aggregates every per-entity store, constructed once from the DB handle
// and injected into the HTTP handlers.
type Stores struct {
	ActiveSession *ActiveSessionStore
	Weight        *WeightStore
	Food          *FoodStore
	User          *UserStore
	Exercise      *ExerciseStore
	Workout       *WorkoutStore
	Program       *ProgramStore
	db            *sql.DB // for operations that must span two stores in one transaction
}

func New(db *sql.DB) *Stores {
	return &Stores{
		ActiveSession: NewActiveSessionStore(db),
		Weight:        NewWeightStore(db),
		Food:          NewFoodStore(db),
		User:          NewUserStore(db),
		Exercise:      NewExerciseStore(db),
		Workout:       NewWorkoutStore(db),
		Program:       NewProgramStore(db),
		db:            db,
	}
}

// inTx runs fn inside a transaction, committing on success and rolling back on
// error. Use it for any store operation that issues two or more statements that
// must commit as a unit (read-modify-write, or multiple writes). Single-statement
// operations are already atomic and must NOT use it.
func inTx[T any](db *sql.DB, fn func(*sql.Tx) (T, error)) (T, error) {
	var zero T
	tx, err := db.Begin()
	if err != nil {
		return zero, err
	}
	defer tx.Rollback() // no-op once Commit succeeds
	v, err := fn(tx)
	if err != nil {
		return zero, err
	}
	if err := tx.Commit(); err != nil {
		return zero, err
	}
	return v, nil
}

// inTxDo is inTx for operations that don't return a value.
func inTxDo(db *sql.DB, fn func(*sql.Tx) error) error {
	_, err := inTx(db, func(tx *sql.Tx) (struct{}, error) {
		return struct{}{}, fn(tx)
	})
	return err
}

package controllers

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Cawlumm/lyftr-backend/db"
)

// Regression test for #30: list handlers used to run nested queries while a
// parent rows cursor was still open, so each request needed multiple pool
// connections at once. With the pool capped at N, N concurrent requests
// deadlocked the pool permanently. The fix scans parents fully and closes the
// cursor before loading children, so one connection per request suffices.
func TestListWorkoutsConcurrentDoesNotExhaustPool(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	// Two workouts with exercises and sets so the nested loaders actually run.
	for w := 0; w < 2; w++ {
		res, err := db.DB.Exec(
			`INSERT INTO workouts (user_id, name) VALUES (?, ?)`, uid, fmt.Sprintf("Workout %d", w),
		)
		if err != nil {
			t.Fatalf("insert workout: %v", err)
		}
		wid, _ := res.LastInsertId()
		weRes, err := db.DB.Exec(
			`INSERT INTO workout_exercises (workout_id, exercise_id, order_index) VALUES (?, ?, 0)`, wid, exID,
		)
		if err != nil {
			t.Fatalf("insert workout_exercise: %v", err)
		}
		weid, _ := weRes.LastInsertId()
		if _, err := db.DB.Exec(
			`INSERT INTO sets (workout_exercise_id, set_number, reps, weight) VALUES (?, 1, 5, 135)`, weid,
		); err != nil {
			t.Fatalf("insert set: %v", err)
		}
	}

	// Small pool + more concurrent requests than connections: the old nested
	// cursor pattern deadlocks here; the fixed code must finish promptly.
	db.DB.SetMaxOpenConns(2)
	const concurrency = 6

	done := make(chan struct{})
	go func() {
		var wg sync.WaitGroup
		for i := 0; i < concurrency; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				c, w := newContext(uid, "GET", "/workouts", nil)
				ListWorkouts(c)
				if w.Code != 200 {
					t.Errorf("ListWorkouts returned %d", w.Code)
				}
			}()
		}
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("concurrent ListWorkouts deadlocked the connection pool (#30 regression)")
	}
}

func TestListProgramsConcurrentDoesNotExhaustPool(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	exID := createTestExercise(t)

	res, err := db.DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, 'PPL')`, uid)
	if err != nil {
		t.Fatalf("insert program: %v", err)
	}
	pid, _ := res.LastInsertId()
	peRes, err := db.DB.Exec(
		`INSERT INTO program_exercises (program_id, exercise_id, order_index) VALUES (?, ?, 0)`, pid, exID,
	)
	if err != nil {
		t.Fatalf("insert program_exercise: %v", err)
	}
	peid, _ := peRes.LastInsertId()
	if _, err := db.DB.Exec(
		`INSERT INTO program_sets (program_exercise_id, set_number, target_reps, target_weight) VALUES (?, 1, 5, 135)`, peid,
	); err != nil {
		t.Fatalf("insert program_set: %v", err)
	}

	db.DB.SetMaxOpenConns(2)
	const concurrency = 6

	done := make(chan struct{})
	go func() {
		var wg sync.WaitGroup
		for i := 0; i < concurrency; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				c, w := newContext(uid, "GET", "/programs", nil)
				ListPrograms(c)
				if w.Code != 200 {
					t.Errorf("ListPrograms returned %d", w.Code)
				}
			}()
		}
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("concurrent ListPrograms deadlocked the connection pool (#30 regression)")
	}
}

package controllers

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
)

// seedProgramDays creates a program owned by uid with Days in the given rest-day
// pattern (true = rest, false = workout), in order_index order, and returns the
// program id.
func seedProgramDays(t *testing.T, uid int64, isRest []bool) int64 {
	t.Helper()
	res, err := db.DB.Exec(`INSERT INTO programs (user_id, name) VALUES (?, 'Cycle Program')`, uid)
	if err != nil {
		t.Fatalf("seed program: %v", err)
	}
	pid, _ := res.LastInsertId()
	for i, rest := range isRest {
		restInt := 0
		if rest {
			restInt = 1
		}
		if _, err := db.DB.Exec(
			`INSERT INTO program_days (program_id, order_index, is_rest_day, name) VALUES (?, ?, ?, '')`,
			pid, i, restInt,
		); err != nil {
			t.Fatalf("seed program day %d: %v", i, err)
		}
	}
	return pid
}

// logWorkouts inserts n bare workout rows attributed to the program (current_day_index
// only cares about the count, not the exercises logged).
func logWorkouts(t *testing.T, uid, pid int64, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		if _, err := db.DB.Exec(
			`INSERT INTO workouts (user_id, name, program_id) VALUES (?, 'logged', ?)`, uid, pid,
		); err != nil {
			t.Fatalf("log workout %d: %v", i, err)
		}
	}
}

func currentDayIndexOf(t *testing.T, uid, pid int64) int {
	t.Helper()
	c, w := newContext(uid, http.MethodGet, "/api/v1/programs/"+fmt.Sprint(pid), nil)
	setParam(c, "id", fmt.Sprint(pid))
	th.GetProgram(c)
	if w.Code != http.StatusOK {
		t.Fatalf("GetProgram: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	data := resp["data"].(map[string]any)
	idx, ok := data["current_day_index"].(float64)
	if !ok {
		t.Fatalf("current_day_index missing or wrong type: %T = %v", data["current_day_index"], data["current_day_index"])
	}
	return int(idx)
}

// TestCurrentDayIndex_SkipsRestDaysCorrectly walks the exact worked example from the
// multi-day-programs task spec — cycle [A, B, Rest, Rest, C, Rest] (len 6) — and
// checks the due slot after each logged workout. A naive COUNT(workouts) MOD 6 lands
// on the wrong slot as soon as a rest day has to be "passed" without a loggable event
// (see the review finding: after A and B are logged it never advances past index 2,
// and logging C out of turn retroactively points the indicator at C itself instead
// of at the next unconsumed slot).
func TestCurrentDayIndex_SkipsRestDaysCorrectly(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	// index: 0=A 1=B 2=Rest 3=Rest 4=C 5=Rest
	pid := seedProgramDays(t, uid, []bool{false, false, true, true, false, true})

	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("no workouts logged yet: expected due index 0 (A), got %d", got)
	}

	logWorkouts(t, uid, pid, 1) // logged A
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after logging A: expected due index 1 (B — no rest sits between A and B), got %d", got)
	}

	logWorkouts(t, uid, pid, 1) // logged B (total 2)
	if got := currentDayIndexOf(t, uid, pid); got != 2 {
		t.Fatalf("after logging A,B: expected due index 2 (Rest#1, right after B), got %d", got)
	}

	logWorkouts(t, uid, pid, 1) // logged C (total 3) — the two rest slots before C
	// never needed a log; logging C at all implies they were already passed.
	if got := currentDayIndexOf(t, uid, pid); got != 5 {
		t.Fatalf("after logging A,B,C: expected due index 5 (Rest#2, the tail rest before A repeats), got %d", got)
	}

	logWorkouts(t, uid, pid, 1) // logged A again (total 4, wraps into a new cycle)
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after wrapping to a second A: expected due index 1 (B) again, got %d", got)
	}
}

// TestCurrentDayIndex_SingleRestDayWrapsBackToStart covers the [A, Rest, B] case from
// the review finding: once both workout days in the cycle are done, the due slot must
// wrap back to A (index 0), not sit on B (the workout just finished, which is what the
// old naive COUNT(workouts) MOD len(days) produced).
func TestCurrentDayIndex_SingleRestDayWrapsBackToStart(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, true, false}) // 0=A 1=Rest 2=B

	logWorkouts(t, uid, pid, 2) // A then B
	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("after logging A,B: expected due index 0 (wrap back to A), got %d", got)
	}
}

// TestCurrentDayIndex_NeverFreezesAcrossMultipleCycles is the direct regression check
// for the review finding's core complaint: with the old naive formula, current_day_index
// froze on a rest slot forever once one sat between two workout days, no matter how
// many further workouts got logged. Log five full cycles' worth of a 4-slot
// [A, Rest, B, Rest] routine back to back and check the due slot keeps moving through
// every logged workout instead of sticking at the same index.
func TestCurrentDayIndex_NeverFreezesAcrossMultipleCycles(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, true, false, true}) // 0=A 1=Rest 2=B 3=Rest

	seen := map[int]bool{}
	for i := 0; i < 10; i++ { // 5 full A/B cycles
		logWorkouts(t, uid, pid, 1)
		seen[currentDayIndexOf(t, uid, pid)] = true
	}
	// Must have visited both due-after-A (1) and due-after-B (3) — a frozen tracker
	// would only ever report one of them after the first couple of logs.
	if !seen[1] || !seen[3] {
		t.Fatalf("expected current_day_index to alternate between 1 and 3 across repeated cycles, saw %v", seen)
	}
}

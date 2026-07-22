package controllers

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/models"
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

// dayIDsOf returns the program's day row ids in cycle (order_index) order.
func dayIDsOf(t *testing.T, pid int64) []int64 {
	t.Helper()
	rows, err := db.DB.Query(`SELECT id FROM program_days WHERE program_id = ? ORDER BY order_index`, pid)
	if err != nil {
		t.Fatalf("query day ids: %v", err)
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan day id: %v", err)
		}
		ids = append(ids, id)
	}
	return ids
}

// logWorkouts inserts n day-less workout rows attributed to the program — the shape
// an older client (predating day tracking) writes. These advance the due-day
// tracker count-based.
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

// logWorkoutOnDay inserts one workout linked to a specific program day at the given
// started_at (a 'YYYY-MM-DD HH:MM:SS' literal so text ordering is deterministic in
// the test), returning the workout id.
func logWorkoutOnDay(t *testing.T, uid, pid, dayID int64, startedAt string) int64 {
	t.Helper()
	res, err := db.DB.Exec(
		`INSERT INTO workouts (user_id, name, program_id, program_day_id, started_at) VALUES (?, 'logged', ?, ?, ?)`,
		uid, pid, dayID, startedAt,
	)
	if err != nil {
		t.Fatalf("log workout on day %d: %v", dayID, err)
	}
	wid, _ := res.LastInsertId()
	return wid
}

// workoutDayLinkOf reads back a workout's stored day linkage.
func workoutDayLinkOf(t *testing.T, wid int64) (dayID *int64, dropped int) {
	t.Helper()
	if err := db.DB.QueryRow(
		`SELECT program_day_id, program_day_dropped FROM workouts WHERE id = ?`, wid,
	).Scan(&dayID, &dropped); err != nil {
		t.Fatalf("read workout %d day link: %v", wid, err)
	}
	return dayID, dropped
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

// updateProgram PUTs the given day list (names/ids/rest flags, no exercises) through
// the real UpdateProgram handler.
func updateProgram(t *testing.T, uid, pid int64, days []models.CreateProgramDayReq) {
	t.Helper()
	body := models.CreateProgramRequest{Name: "Cycle Program", Days: days}
	c, w := newContext(uid, http.MethodPut, "/api/v1/programs/"+fmt.Sprint(pid), body)
	setParam(c, "id", fmt.Sprint(pid))
	th.UpdateProgram(c)
	if w.Code != http.StatusOK {
		t.Fatalf("UpdateProgram: expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ── Day-less (older-client) fallback ─────────────────────────────────────────────

// TestCurrentDayIndex_DaylessLogsSkipRestDays: rows with no day linkage (older
// clients) advance the tracker count-based through the WORKOUT days only — a rest
// day is never due. Cycle [A, B, Rest, Rest, C, Rest].
func TestCurrentDayIndex_DaylessLogsSkipRestDays(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	// index: 0=A 1=B 2=Rest 3=Rest 4=C 5=Rest
	pid := seedProgramDays(t, uid, []bool{false, false, true, true, false, true})

	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("no workouts logged yet: expected due index 0 (A), got %d", got)
	}
	logWorkouts(t, uid, pid, 1) // A done
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after logging A: expected due index 1 (B), got %d", got)
	}
	logWorkouts(t, uid, pid, 1) // B done
	if got := currentDayIndexOf(t, uid, pid); got != 4 {
		t.Fatalf("after logging A,B: expected due index 4 (C — rest slots are never due), got %d", got)
	}
	logWorkouts(t, uid, pid, 1) // C done — cycle wraps
	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("after logging A,B,C: expected due index 0 (wrap to A), got %d", got)
	}
}

// TestCurrentDayIndex_SingleRestDayWrapsBackToStart covers the [A, Rest, B] case:
// once both workout days in the cycle are done, the due slot must wrap back to A
// (index 0), not sit on B.
func TestCurrentDayIndex_SingleRestDayWrapsBackToStart(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, true, false}) // 0=A 1=Rest 2=B

	logWorkouts(t, uid, pid, 2) // A then B
	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("after logging A,B: expected due index 0 (wrap back to A), got %d", got)
	}
}

// TestCurrentDayIndex_NeverFreezesAcrossMultipleCycles: the due index must keep
// alternating between the two workout days of [A, Rest, B, Rest] across repeated
// cycles — a frozen tracker reports only one of them after the first couple of logs.
func TestCurrentDayIndex_NeverFreezesAcrossMultipleCycles(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, true, false, true}) // 0=A 1=Rest 2=B 3=Rest

	seen := map[int]bool{}
	for i := 0; i < 10; i++ { // 5 full A/B cycles
		logWorkouts(t, uid, pid, 1)
		seen[currentDayIndexOf(t, uid, pid)] = true
	}
	if !seen[0] || !seen[2] {
		t.Fatalf("expected current_day_index to alternate between 0 (A) and 2 (B) across repeated cycles, saw %v", seen)
	}
}

// ── Day-accurate tracking (workouts.program_day_id) ──────────────────────────────

// TestCurrentDayIndex_RepeatingADayDoesNotSkip: logging the same day twice in a row
// must leave the due day parked on the NEXT day in sequence — a blind count would
// advance through the cycle as if the repeats were done in order.
func TestCurrentDayIndex_RepeatingADayDoesNotSkip(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false, false}) // 0=A 1=B 2=C
	ids := dayIDsOf(t, pid)

	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-01 10:00:00")
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after logging A: expected due index 1 (B), got %d", got)
	}
	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-02 10:00:00") // A again
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after repeating A: expected due index still 1 (B), got %d", got)
	}
	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-03 10:00:00") // and again
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after repeating A twice: expected due index still 1 (B), got %d", got)
	}
}

// TestCurrentDayIndex_OutOfOrderLoggingFollowsLastLogged: manually picking a day
// other than the due one moves the tracker to whatever follows THAT day — it does
// not try to remember the skipped day (deliberate simplification).
func TestCurrentDayIndex_OutOfOrderLoggingFollowsLastLogged(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false, false}) // 0=A 1=B 2=C
	ids := dayIDsOf(t, pid)

	logWorkoutOnDay(t, uid, pid, ids[2], "2026-07-01 10:00:00") // C first
	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("after logging C out of order: expected due index 0 (wrap to A), got %d", got)
	}
	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-02 10:00:00") // then A
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after logging A: expected due index 1 (B), got %d", got)
	}
	logWorkoutOnDay(t, uid, pid, ids[1], "2026-07-03 10:00:00") // then B
	if got := currentDayIndexOf(t, uid, pid); got != 2 {
		t.Fatalf("after logging B: expected due index 2 (C), got %d", got)
	}
}

// TestCurrentDayIndex_FullCycleWithRestDays walks a whole day-linked cycle of
// [A, Rest, B, Rest, C]: the due index always lands on the next WORKOUT day after
// the one just logged, skipping over rest days, and wraps at the end.
func TestCurrentDayIndex_FullCycleWithRestDays(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, true, false, true, false}) // 0=A 1=R 2=B 3=R 4=C
	ids := dayIDsOf(t, pid)

	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-01 10:00:00") // A
	if got := currentDayIndexOf(t, uid, pid); got != 2 {
		t.Fatalf("after A: expected due index 2 (B), got %d", got)
	}
	logWorkoutOnDay(t, uid, pid, ids[2], "2026-07-02 10:00:00") // B
	if got := currentDayIndexOf(t, uid, pid); got != 4 {
		t.Fatalf("after B: expected due index 4 (C), got %d", got)
	}
	logWorkoutOnDay(t, uid, pid, ids[4], "2026-07-03 10:00:00") // C — wraps
	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("after C: expected due index 0 (wrap to A), got %d", got)
	}
}

// ── Program edits must not corrupt day linkage ───────────────────────────────────

// TestCurrentDayIndex_SurvivesProgramRename: an id-carrying update that only renames
// days keeps every workout linked to its original day row — the tracker must not
// reset.
func TestCurrentDayIndex_SurvivesProgramRename(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false, false}) // 0=A 1=B 2=C
	ids := dayIDsOf(t, pid)

	wid := logWorkoutOnDay(t, uid, pid, ids[1], "2026-07-01 10:00:00") // B
	updateProgram(t, uid, pid, []models.CreateProgramDayReq{
		{ID: ids[0], Name: "Push"},
		{ID: ids[1], Name: "Pull"},
		{ID: ids[2], Name: "Legs"},
	})
	if got := currentDayIndexOf(t, uid, pid); got != 2 {
		t.Fatalf("after rename: expected due index 2 (day after B), got %d", got)
	}
	dayID, dropped := workoutDayLinkOf(t, wid)
	if dayID == nil || *dayID != ids[1] || dropped != 0 {
		t.Fatalf("rename must keep the workout linked to its day: got dayID=%v dropped=%d", dayID, dropped)
	}
}

// TestCurrentDayIndex_ReorderKeepsDayLinkage is the regression check for the
// positional-matching bug: moving days around must keep every workout attributed to
// the SAME day (matched by id), so the due day follows the day's new position
// instead of silently re-attributing the history.
func TestCurrentDayIndex_ReorderKeepsDayLinkage(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false, false}) // 0=Push 1=Pull 2=Legs
	ids := dayIDsOf(t, pid)

	wid := logWorkoutOnDay(t, uid, pid, ids[1], "2026-07-01 10:00:00") // Pull
	if got := currentDayIndexOf(t, uid, pid); got != 2 {
		t.Fatalf("after Pull: expected due index 2 (Legs), got %d", got)
	}

	// Move Legs to the front: [Legs, Push, Pull].
	updateProgram(t, uid, pid, []models.CreateProgramDayReq{
		{ID: ids[2], Name: "Legs"},
		{ID: ids[0], Name: "Push"},
		{ID: ids[1], Name: "Pull"},
	})

	// The anchor workout is still a Pull workout; Pull now sits at index 2, so the
	// day after it wraps to Legs at index 0. Positional matching would have turned
	// the anchor into "Push" and reported Pull — the day just completed — as due.
	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("after reorder: expected due index 0 (Legs, next after Pull), got %d", got)
	}
	dayID, dropped := workoutDayLinkOf(t, wid)
	if dayID == nil || *dayID != ids[1] || dropped != 0 {
		t.Fatalf("reorder must keep the workout linked to Pull's row: got dayID=%v dropped=%d", dayID, dropped)
	}
}

// TestCurrentDayIndex_MiddleRemovalDropsOnlyThatDaysLinkage: removing a day from the
// MIDDLE of the cycle must drop linkage for exactly that day's workouts (marked as
// residue) and leave every kept day's history attached.
func TestCurrentDayIndex_MiddleRemovalDropsOnlyThatDaysLinkage(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false, false}) // 0=A 1=B 2=C
	ids := dayIDsOf(t, pid)

	widA := logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-01 10:00:00")
	widB := logWorkoutOnDay(t, uid, pid, ids[1], "2026-07-02 10:00:00")
	widC := logWorkoutOnDay(t, uid, pid, ids[2], "2026-07-03 10:00:00")

	// Remove B: [A, C].
	updateProgram(t, uid, pid, []models.CreateProgramDayReq{
		{ID: ids[0], Name: "A"},
		{ID: ids[2], Name: "C"},
	})

	if dayID, dropped := workoutDayLinkOf(t, widA); dayID == nil || *dayID != ids[0] || dropped != 0 {
		t.Fatalf("A's workout must stay linked to A: got dayID=%v dropped=%d", dayID, dropped)
	}
	if dayID, dropped := workoutDayLinkOf(t, widC); dayID == nil || *dayID != ids[2] || dropped != 0 {
		t.Fatalf("C's workout must stay linked to C: got dayID=%v dropped=%d", dayID, dropped)
	}
	if dayID, dropped := workoutDayLinkOf(t, widB); dayID != nil || dropped != 1 {
		t.Fatalf("B's workout must be un-linked and marked dropped: got dayID=%v dropped=%d", dayID, dropped)
	}
	// Most recent linked workout is C's; the day after C wraps to A at index 0.
	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("after removing B: expected due index 0 (wrap after C), got %d", got)
	}
}

// TestCurrentDayIndex_DeletedDayResidueDoesNotSwingDueDay: deleting a day with a
// long logged history must not decide the new due day by the parity of that
// history's count — with no anchor left, the first workout day is due (the spec's
// "no qualifying workout yet" case).
func TestCurrentDayIndex_DeletedDayResidueDoesNotSwingDueDay(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false, false}) // 0=A 1=B 2=C
	ids := dayIDsOf(t, pid)

	for i := 0; i < 5; i++ { // 5 workouts, all on A — an odd count
		logWorkoutOnDay(t, uid, pid, ids[0], fmt.Sprintf("2026-07-0%d 10:00:00", i+1))
	}
	// Delete A: [B, C]. All 5 rows become residue at once.
	updateProgram(t, uid, pid, []models.CreateProgramDayReq{
		{ID: ids[1], Name: "B"},
		{ID: ids[2], Name: "C"},
	})
	// No anchor remains; residue is ignored, so the first workout day (B) is due.
	// Counting the residue would report workoutIdx[5 % 2] = C instead.
	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("after deleting A: expected due index 0 (B, first workout day), got %d", got)
	}
}

// TestCurrentDayIndex_ToggleWorkoutDayToRest: editing a logged-against day into a
// rest day sheds that day's workout linkage (rest days can never be due) and marks
// the shed rows dropped, exactly like a deleted day — residue, ignored by the
// tracker rather than miscounted as count-based advances.
func TestCurrentDayIndex_ToggleWorkoutDayToRest(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false, false}) // 0=A 1=B 2=C
	ids := dayIDsOf(t, pid)

	logWorkoutOnDay(t, uid, pid, ids[2], "2026-07-01 10:00:00")         // C
	widA := logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-02 10:00:00") // then A

	// Toggle A to rest: [Rest, B, C].
	updateProgram(t, uid, pid, []models.CreateProgramDayReq{
		{ID: ids[0], Name: "A", IsRestDay: true},
		{ID: ids[1], Name: "B"},
		{ID: ids[2], Name: "C"},
	})

	dayID, dropped := workoutDayLinkOf(t, widA)
	if dayID != nil || dropped != 1 {
		t.Fatalf("rest-toggled day's workout must be un-linked AND marked dropped: got dayID=%v dropped=%d", dayID, dropped)
	}
	// The anchor falls back to the C workout; the shed A row is residue and is
	// ignored (its cycle position no longer exists), so the day after C wraps past
	// the new rest slot to B at index 1.
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after toggling A to rest: expected due index 1 (B, next after anchor C), got %d", got)
	}
}

// TestCurrentDayIndex_ToggleWithOddRepeatsDoesNotSwingDueDay: rest-toggling a day
// with an ODD number of logged repeats must not swing the due day — the shed rows
// are residue (dropped), never count-based advances. Counting them would report
// workoutIdx[3 % 2] = C here.
func TestCurrentDayIndex_ToggleWithOddRepeatsDoesNotSwingDueDay(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false, false}) // 0=A 1=B 2=C
	ids := dayIDsOf(t, pid)

	// Log A three times (repeating the same day)
	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-01 10:00:00") // A
	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-02 10:00:00") // A
	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-03 10:00:00") // A

	// At this point, due should be B (repeats don't advance)
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after three A repeats: expected due index 1 (B), got %d", got)
	}

	// Now toggle A to rest: [Rest, B, C]
	updateProgram(t, uid, pid, []models.CreateProgramDayReq{
		{ID: ids[0], Name: "A", IsRestDay: true},
		{ID: ids[1], Name: "B"},
		{ID: ids[2], Name: "C"},
	})

	// All three A rows became dropped residue: no anchor remains, residue is
	// ignored, so the first workout day (B, index 1) is due — same as before the
	// toggle.
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after toggling A to rest with 3 repeats: expected due index 1 (B), got %d", got)
	}
}

// TestCurrentDayIndex_ToggleWithEvenRepeatsDoesNotSwingDueDay: same scenario with an
// EVEN repeat count — counting the shed rows would report workoutIdx[2 % 2] = B by
// luck of parity here and C for the odd case above; both must stay B.
func TestCurrentDayIndex_ToggleWithEvenRepeatsDoesNotSwingDueDay(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false, false}) // 0=A 1=B 2=C
	ids := dayIDsOf(t, pid)

	// Log A twice
	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-01 10:00:00") // A
	logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-02 10:00:00") // A

	// At this point, due should be B
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after two A repeats: expected due index 1 (B), got %d", got)
	}

	// Now toggle A to rest: [Rest, B, C]
	updateProgram(t, uid, pid, []models.CreateProgramDayReq{
		{ID: ids[0], Name: "A", IsRestDay: true},
		{ID: ids[1], Name: "B"},
		{ID: ids[2], Name: "C"},
	})

	// Dropped residue is ignored: no anchor → first workout day (B) is due.
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after toggling A to rest with 2 repeats: expected due index 1 (B), got %d", got)
	}
}

// TestUpdateProgram_LegacyIDlessRequestMatchesByPosition: a request carrying no day
// ids (a client predating the id round-trip) still updates day rows in place by
// position — a same-shape edit must not scrub the program's workout history.
func TestUpdateProgram_LegacyIDlessRequestMatchesByPosition(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false}) // 0=A 1=B
	ids := dayIDsOf(t, pid)

	wid := logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-01 10:00:00") // A
	updateProgram(t, uid, pid, []models.CreateProgramDayReq{
		{Name: "Renamed A"},
		{Name: "Renamed B"},
	})
	dayID, dropped := workoutDayLinkOf(t, wid)
	if dayID == nil || *dayID != ids[0] || dropped != 0 {
		t.Fatalf("legacy positional update must keep the workout linked: got dayID=%v dropped=%d", dayID, dropped)
	}
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("after legacy rename: expected due index 1 (B), got %d", got)
	}
}

// TestUpdateProgram_ModernReplaceAllDaysDropsOldHistory: a modern client
// (day_ids_known) that deletes EVERY existing day and adds only new (id-less) ones
// sends zero ids — indistinguishable by content from a legacy payload. The flag must
// force id matching so the old days are really deleted (history dropped as residue)
// instead of positionally renamed in place, which would silently re-attribute the
// deleted days' workout history to the brand-new days.
func TestUpdateProgram_ModernReplaceAllDaysDropsOldHistory(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false}) // 0=Push 1=Pull
	ids := dayIDsOf(t, pid)

	wid := logWorkoutOnDay(t, uid, pid, ids[0], "2026-07-01 10:00:00") // Push

	// Delete Push and Pull, add Squat — no ids, but the client declares it knows them.
	body := models.CreateProgramRequest{
		Name:        "Cycle Program",
		DayIDsKnown: true,
		Days:        []models.CreateProgramDayReq{{Name: "Squat"}},
	}
	c, w := newContext(uid, http.MethodPut, "/api/v1/programs/"+fmt.Sprint(pid), body)
	setParam(c, "id", fmt.Sprint(pid))
	th.UpdateProgram(c)
	if w.Code != http.StatusOK {
		t.Fatalf("UpdateProgram: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	newIDs := dayIDsOf(t, pid)
	if len(newIDs) != 1 || newIDs[0] == ids[0] || newIDs[0] == ids[1] {
		t.Fatalf("expected one brand-new Squat day row, got ids %v (old were %v)", newIDs, ids)
	}
	dayID, dropped := workoutDayLinkOf(t, wid)
	if dayID != nil || dropped != 1 {
		t.Fatalf("deleted Push's workout must be un-linked and marked dropped, not re-attributed: got dayID=%v dropped=%d", dayID, dropped)
	}
	// No anchor remains and residue is ignored → the (only) new workout day is due.
	if got := currentDayIndexOf(t, uid, pid); got != 0 {
		t.Fatalf("after replace-all: expected due index 0 (Squat), got %d", got)
	}
}

// TestUpdateProgram_ForeignDayIDCannotHijack: an update carrying another user's day
// id must not touch that row — the id is treated as a new day of the caller's own
// program (ownership-on-every-write convention).
func TestUpdateProgram_ForeignDayIDCannotHijack(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	// createTestUser has a fixed UNIQUE email — insert the second user manually.
	res, err := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('other@example.com', 'hashed')`)
	if err != nil {
		t.Fatalf("create second user: %v", err)
	}
	otherUID, _ := res.LastInsertId()
	otherPID := seedProgramDays(t, otherUID, []bool{false})
	otherDayID := dayIDsOf(t, otherPID)[0]

	pid := seedProgramDays(t, uid, []bool{false})
	updateProgram(t, uid, pid, []models.CreateProgramDayReq{
		{ID: otherDayID, Name: "Hijack"},
	})

	var name string
	var victimPID int64
	if err := db.DB.QueryRow(`SELECT name, program_id FROM program_days WHERE id = ?`, otherDayID).Scan(&name, &victimPID); err != nil {
		t.Fatalf("read victim day: %v", err)
	}
	if name != "" || victimPID != otherPID {
		t.Fatalf("foreign day row was modified: name=%q program_id=%d", name, victimPID)
	}
}

// ── Write-path guards ────────────────────────────────────────────────────────────

// TestCreateWorkout_RestDayLinkageScrubsToNull: POSTing a workout claiming a REST
// day's id must store a NULL day link (like a stale/foreign id) — a persisted
// rest-day link would be invisible to the due-day tracker forever.
func TestCreateWorkout_RestDayLinkageScrubsToNull(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, true, false}) // 0=A 1=Rest 2=B
	restDayID := dayIDsOf(t, pid)[1]

	body := models.CreateWorkoutRequest{Name: "Rest?", ProgramID: &pid, ProgramDayID: &restDayID}
	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateWorkout: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	resp := decodeResponse(t, w)
	wid := int64(resp["data"].(map[string]any)["id"].(float64))
	dayID, dropped := workoutDayLinkOf(t, wid)
	if dayID != nil || dropped != 0 {
		t.Fatalf("rest-day id must degrade to NULL: got dayID=%v dropped=%d", dayID, dropped)
	}
}

// TestCurrentDayIndex_OffsetTimestampsOrderChronologically: the tracker orders rows
// by started_at as stored text, so the write path must normalize offsets to UTC —
// otherwise a workout sent with a +08:00 wall-clock later than a UTC row's (but an
// EARLIER instant) would wrongly become the anchor.
func TestCurrentDayIndex_OffsetTimestampsOrderChronologically(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	pid := seedProgramDays(t, uid, []bool{false, false}) // 0=A 1=B
	ids := dayIDsOf(t, pid)

	post := func(dayID int64, startedAt string) {
		t.Helper()
		body := map[string]any{"name": "tz", "program_id": pid, "program_day_id": dayID, "started_at": startedAt}
		c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", body)
		th.CreateWorkout(c)
		if w.Code != http.StatusCreated {
			t.Fatalf("CreateWorkout: expected 201, got %d: %s", w.Code, w.Body.String())
		}
	}
	post(ids[0], "2026-07-18T20:00:00Z")      // A at 20:00Z — the true most recent
	post(ids[1], "2026-07-19T02:00:00+08:00") // B at 18:00Z, wall-clock "later"

	// Chronologically the A workout is most recent → B is due. Comparing raw
	// wall-clock text would anchor on the B row and report A as due.
	if got := currentDayIndexOf(t, uid, pid); got != 1 {
		t.Fatalf("expected due index 1 (B — A's row is the true most recent), got %d", got)
	}
}

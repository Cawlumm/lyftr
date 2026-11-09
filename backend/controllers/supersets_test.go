package controllers

import (
	"encoding/json"
	"net/http"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
)

func loadSupersetFixtures(t *testing.T) []struct {
	Name       string `json:"name"`
	Input      []*int `json:"input"`
	Normalised []*int `json:"normalised"`
	Contiguous bool   `json:"contiguous"`
} {
	t.Helper()
	raw, err := os.ReadFile("../../packages/shared/src/utils/supersets.fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []struct {
			Name       string `json:"name"`
			Input      []*int `json:"input"`
			Normalised []*int `json:"normalised"`
			Contiguous bool   `json:"contiguous"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	return f.Cases
}

func TestSupersetsContiguous_matchesSharedFixtures(t *testing.T) {
	for _, tc := range loadSupersetFixtures(t) {
		if got := supersetsContiguous(tc.Input); got != tc.Contiguous {
			t.Errorf("%s: contiguous = %v, want %v", tc.Name, got, tc.Contiguous)
		}
	}
}

func wexList(groups []any, exID int64) []map[string]any {
	out := make([]map[string]any, len(groups))
	for i, g := range groups {
		ex := map[string]any{"exercise_id": exID, "sets": []map[string]any{{"reps": 5, "weight": 100}}}
		if g != nil {
			ex["superset_group"] = g
		}
		out[i] = ex
	}
	return out
}

func pexList(groups []any, exID int64) []map[string]any {
	out := make([]map[string]any, len(groups))
	for i, g := range groups {
		ex := map[string]any{"exercise_id": exID, "sets": []map[string]any{{"target_reps": 5, "target_weight": 100}}}
		if g != nil {
			ex["superset_group"] = g
		}
		out[i] = ex
	}
	return out
}

func postWorkout(t *testing.T, uid int64, groups []any, exID int64) (int, map[string]any) {
	t.Helper()
	c, w := newContext(uid, http.MethodPost, "/api/v1/workouts", map[string]any{"name": "SS", "exercises": wexList(groups, exID)})
	th.CreateWorkout(c)
	return w.Code, decodeResponse(t, w)
}

func postProgram(t *testing.T, uid int64, days [][]any, exID int64) (int, map[string]any) {
	t.Helper()
	ds := []map[string]any{}
	for _, g := range days {
		ds = append(ds, map[string]any{"is_rest_day": false, "exercises": pexList(g, exID)})
	}
	c, w := newContext(uid, http.MethodPost, "/api/v1/programs", map[string]any{"name": "SS", "days": ds})
	th.CreateProgram(c)
	return w.Code, decodeResponse(t, w)
}

// groupsOf reads superset_group per exercise; a missing key (not an explicit null)
// fails the test so "explicit null on output" is pinned.
func groupsOf(t *testing.T, exs []any) []any {
	t.Helper()
	out := make([]any, len(exs))
	for i, e := range exs {
		m := e.(map[string]any)
		v, ok := m["superset_group"]
		if !ok {
			t.Fatalf("exercise %d has no superset_group key; want explicit null", i)
		}
		out[i] = v
	}
	return out
}

func wantGroups(t *testing.T, got []any, want ...any) {
	t.Helper()
	w := make([]any, len(want))
	for i, v := range want {
		if v != nil {
			w[i] = float64(v.(int))
		}
	}
	if !reflect.DeepEqual(got, w) {
		t.Errorf("groups = %v, want %v", got, w)
	}
}

func workoutExercises(body map[string]any) []any {
	return body["data"].(map[string]any)["exercises"].([]any)
}

func programDays(body map[string]any) []any {
	return body["data"].(map[string]any)["days"].([]any)
}

func TestWorkoutSupersetGroupRoundTrips(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	code, body := postWorkout(t, uid, []any{1, 1, nil}, ex)
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, body)
	}
	wantGroups(t, groupsOf(t, workoutExercises(body)), 1, 1, nil)

	id := int64(body["data"].(map[string]any)["id"].(float64))
	c, w := newContext(uid, http.MethodGet, "/api/v1/workouts/"+strconv.FormatInt(id, 10), nil)
	setParam(c, "id", strconv.FormatInt(id, 10))
	th.GetWorkout(c)
	wantGroups(t, groupsOf(t, workoutExercises(decodeResponse(t, w))), 1, 1, nil)
}

func TestProgramSupersetGroupRoundTrips(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	code, body := postProgram(t, uid, [][]any{{1, 1, nil}}, ex)
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, body)
	}
	exs := programDays(body)[0].(map[string]any)["exercises"].([]any)
	wantGroups(t, groupsOf(t, exs), 1, 1, nil)

	id := strconv.FormatInt(int64(body["data"].(map[string]any)["id"].(float64)), 10)
	c, w := newContext(uid, http.MethodGet, "/api/v1/programs/"+id, nil)
	setParam(c, "id", id)
	th.GetProgram(c)
	exs = programDays(decodeResponse(t, w))[0].(map[string]any)["exercises"].([]any)
	wantGroups(t, groupsOf(t, exs), 1, 1, nil)
}

func TestUpdateWorkout_linksAndUnlinks(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	_, body := postWorkout(t, uid, []any{nil, nil, nil}, ex)
	id := strconv.FormatInt(int64(body["data"].(map[string]any)["id"].(float64)), 10)

	put := func(groups []any) []any {
		c, w := newContext(uid, http.MethodPut, "/api/v1/workouts/"+id, map[string]any{"name": "SS", "exercises": wexList(groups, ex)})
		setParam(c, "id", id)
		th.UpdateWorkout(c)
		if w.Code != http.StatusOK {
			t.Fatalf("update: %d %s", w.Code, w.Body.String())
		}
		return groupsOf(t, workoutExercises(decodeResponse(t, w)))
	}
	wantGroups(t, put([]any{4, 4, nil}), 1, 1, nil)
	wantGroups(t, put([]any{nil, 2, 2}), nil, 1, 1)
	wantGroups(t, put([]any{nil, nil, nil}), nil, nil, nil)
}

func TestUpdateProgram_linksAndUnlinks(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	_, body := postProgram(t, uid, [][]any{{nil, nil, nil}}, ex)
	id := strconv.FormatInt(int64(body["data"].(map[string]any)["id"].(float64)), 10)

	put := func(groups []any) []any {
		c, w := newContext(uid, http.MethodPut, "/api/v1/programs/"+id, map[string]any{
			"name": "SS",
			"days": []map[string]any{{"is_rest_day": false, "exercises": pexList(groups, ex)}},
		})
		setParam(c, "id", id)
		th.UpdateProgram(c)
		if w.Code != http.StatusOK {
			t.Fatalf("update: %d %s", w.Code, w.Body.String())
		}
		return groupsOf(t, programDays(decodeResponse(t, w))[0].(map[string]any)["exercises"].([]any))
	}
	wantGroups(t, put([]any{1, 1, 1}), 1, 1, 1)
	wantGroups(t, put([]any{1, 1, nil}), 1, 1, nil)
	wantGroups(t, put([]any{nil, nil, nil}), nil, nil, nil)
}

func TestCreate_nonContiguousRejected(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	const msg = "Exercises in a superset must be next to each other."

	code, body := postWorkout(t, uid, []any{1, nil, 1}, ex)
	if code != http.StatusUnprocessableEntity || violationCode(body) != "SUPERSET_NOT_CONTIGUOUS" || body["error"] != msg {
		t.Errorf("workout: %d %v", code, body)
	}
	// Valid on day one, broken on day two.
	code, body = postProgram(t, uid, [][]any{{1, 1}, {2, 1, 2}}, ex)
	if code != http.StatusUnprocessableEntity || violationCode(body) != "SUPERSET_NOT_CONTIGUOUS" || body["error"] != msg {
		t.Errorf("program: %d %v", code, body)
	}
	if n := countRows(t, "workouts") + countRows(t, "programs"); n != 0 {
		t.Errorf("rejected requests left %d rows", n)
	}
}

func countRows(t *testing.T, table string) int {
	t.Helper()
	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestCreate_groupOutOfRange(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	for _, g := range []int{0, 1000, -1} {
		if code, body := postWorkout(t, uid, []any{g, g}, ex); code != http.StatusBadRequest && code != http.StatusUnprocessableEntity {
			t.Errorf("workout group %d accepted: %d %v", g, code, body)
		}
		if code, body := postProgram(t, uid, [][]any{{g, g}}, ex); code != http.StatusBadRequest && code != http.StatusUnprocessableEntity {
			t.Errorf("program group %d accepted: %d %v", g, code, body)
		}
	}
	if code, _ := postWorkout(t, uid, []any{999, 999}, ex); code != http.StatusCreated {
		t.Errorf("999 rejected: %d", code)
	}
}

func TestCreate_singletonNormalisedToNull(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	_, body := postWorkout(t, uid, []any{7, nil, 9, 9}, ex)
	wantGroups(t, groupsOf(t, workoutExercises(body)), nil, nil, 1, 1)
	_, body = postProgram(t, uid, [][]any{{3, nil}}, ex)
	wantGroups(t, groupsOf(t, programDays(body)[0].(map[string]any)["exercises"].([]any)), nil, nil)
}

func TestOldClientOmitsGroup_storesNull(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	_, body := postWorkout(t, uid, []any{1, 1}, ex)
	id := strconv.FormatInt(int64(body["data"].(map[string]any)["id"].(float64)), 10)

	c, w := newContext(uid, http.MethodPut, "/api/v1/workouts/"+id, map[string]any{
		"name":      "SS",
		"exercises": []map[string]any{{"exercise_id": ex, "sets": []map[string]any{{"reps": 5}}}, {"exercise_id": ex}},
	})
	setParam(c, "id", id)
	th.UpdateWorkout(c)
	if w.Code != http.StatusOK {
		t.Fatalf("update: %d %s", w.Code, w.Body.String())
	}
	wantGroups(t, groupsOf(t, workoutExercises(decodeResponse(t, w))), nil, nil)
}

func TestProgramDaysMayReuseGroupLabel(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	code, body := postProgram(t, uid, [][]any{{1, 1}, {nil, 1, 1}}, ex)
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, body)
	}
	days := programDays(body)
	wantGroups(t, groupsOf(t, days[0].(map[string]any)["exercises"].([]any)), 1, 1)
	wantGroups(t, groupsOf(t, days[1].(map[string]any)["exercises"].([]any)), nil, 1, 1)
}

func TestMixedGroupedAndUngroupedUpdateReadsExplicitNull(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	ex := createTestExercise(t)
	_, body := postWorkout(t, uid, []any{nil, 2, 2, nil}, ex)
	id := strconv.FormatInt(int64(body["data"].(map[string]any)["id"].(float64)), 10)
	c, w := newContext(uid, http.MethodGet, "/api/v1/workouts/"+id, nil)
	setParam(c, "id", id)
	th.GetWorkout(c)
	raw := w.Body.String()
	wantGroups(t, groupsOf(t, workoutExercises(decodeResponse(t, w))), nil, 1, 1, nil)
	if !jsonHasNullGroup(raw) {
		t.Errorf("body lacks \"superset_group\":null: %s", raw)
	}
}

func jsonHasNullGroup(s string) bool {
	return len(s) > 0 && strings.Contains(s, `"superset_group":null`)
}

func violationCode(body map[string]any) string {
	params, _ := body["params"].(map[string]any)
	vs, _ := params["violations"].([]any)
	if len(vs) != 1 {
		return ""
	}
	code, _ := vs[0].(map[string]any)["code"].(string)
	return code
}

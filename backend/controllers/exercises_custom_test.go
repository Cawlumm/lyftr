package controllers

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/gin-gonic/gin"
)

func secondUser(t *testing.T) int64 {
	t.Helper()
	res, err := db.DB.Exec(`INSERT INTO users (email, password_hash) VALUES ('b@example.com', 'hashed')`)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func createCustom(t *testing.T, uid int64, body map[string]any) (int, map[string]any) {
	t.Helper()
	c, w := newContext(uid, http.MethodPost, "/api/v1/exercises", body)
	th.CreateExercise(c)
	return w.Code, decodeResponse(t, w)
}

func idOf(t *testing.T, resp map[string]any) int64 {
	t.Helper()
	data, ok := resp["data"].(map[string]any)
	if !ok {
		t.Fatalf("no data in %v", resp)
	}
	return int64(data["id"].(float64))
}

func TestCreateExercise_Defaults(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	code, resp := createCustom(t, uid, map[string]any{
		"name": "  Sled Push  ", "muscle_group": "quadriceps", "secondary_muscles": []string{"quadriceps", "glutes", "glutes"},
	})
	if code != http.StatusCreated {
		t.Fatalf("status %d: %v", code, resp)
	}
	d := resp["data"].(map[string]any)
	if d["name"] != "Sled Push" || d["equipment"] != "body-only" || d["category"] != "strength" ||
		d["is_custom"] != true || d["archived"] != false {
		t.Errorf("data = %v", d)
	}
	if _, has := d["merged_into_id"]; has {
		t.Error("merged_into_id must be omitted when null")
	}
	if sec := d["secondary_muscles"].([]any); len(sec) != 1 || sec[0] != "glutes" {
		t.Errorf("secondary_muscles = %v", sec)
	}
}

func TestCreateExercise_ValidatesTaxonomy(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	check := func(field string, body map[string]any) {
		t.Helper()
		code, resp := createCustom(t, uid, body)
		params, _ := resp["params"].(map[string]any)
		if code != http.StatusUnprocessableEntity || resp["code"] != "INVALID_TAXONOMY" || params["field"] != field {
			t.Errorf("%s %v: %d %v", field, body, code, resp)
		}
	}
	for field, body := range map[string]map[string]any{
		"muscle_group":      {"name": "n", "muscle_group": "pecs"},
		"equipment":         {"name": "n", "muscle_group": "chest", "equipment": "rope"},
		"category":          {"name": "n", "muscle_group": "chest", "category": "yoga"},
		"secondary_muscles": {"name": "n", "muscle_group": "chest", "secondary_muscles": []string{"wings"}},
	} {
		check(field, body)
	}
	// Slugs the labels know but the catalog never uses, and equipment "none", which the form
	// leaves to body-only: the server takes exactly what the form offers.
	for field, body := range map[string]map[string]any{
		"muscle_group":      {"name": "n", "muscle_group": "full-body"},
		"equipment":         {"name": "n", "muscle_group": "chest", "equipment": "none"},
		"secondary_muscles": {"name": "n", "muscle_group": "chest", "secondary_muscles": []string{"abs"}},
	} {
		check(field, body)
	}
	for name, body := range map[string]map[string]any{
		"no name":      {"muscle_group": "chest"},
		"blank name":   {"name": "   ", "muscle_group": "chest"},
		"no muscle":    {"name": "n"},
		"control char": {"name": "a\nb", "muscle_group": "chest"},
		"long name":    {"name": string(make([]rune, 101)) + "x", "muscle_group": "chest"},
		"long notes":   {"name": "n", "muscle_group": "chest", "description": string(make([]byte, 2001))},
		"many muscles": {"name": "n", "muscle_group": "chest", "secondary_muscles": []string{"abdominals", "abductors", "adductors", "biceps", "calves", "forearms", "glutes", "hamstrings", "lats", "neck", "traps"}},
	} {
		if name == "long name" {
			body["name"] = fmt.Sprintf("%0101d", 1)
		}
		if name == "long notes" {
			body["description"] = fmt.Sprintf("%02001d", 1)
		}
		if code, resp := createCustom(t, uid, body); code < 400 || code >= 500 {
			t.Errorf("%s: %d %v", name, code, resp)
		}
	}
}

func TestCreateExercise_NameTakenAndLimit(t *testing.T) {
	setupTestDB(t)
	uid := createTestUser(t)
	body := map[string]any{"name": "Sled Push", "muscle_group": "chest"}
	createCustom(t, uid, body)
	code, resp := createCustom(t, uid, map[string]any{"name": "sled push", "muscle_group": "chest"})
	if code != http.StatusConflict || resp["code"] != "EXERCISE_NAME_TAKEN" || resp["params"].(map[string]any)["name"] != "sled push" {
		t.Errorf("%d %v", code, resp)
	}
	if _, err := db.DB.Exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 500)
		INSERT INTO exercises (name, owner_user_id) SELECT 'x' || i, ? FROM n`, uid); err != nil {
		t.Fatal(err)
	}
	code, resp = createCustom(t, uid, map[string]any{"name": "More", "muscle_group": "chest"})
	if code != http.StatusConflict || resp["code"] != "CUSTOM_EXERCISE_LIMIT" || resp["params"].(map[string]any)["limit"] != float64(500) {
		t.Errorf("%d %v", code, resp)
	}
}

func TestGetExercise_OtherUsersCustomIs404(t *testing.T) {
	setupTestDB(t)
	a := createTestUser(t)
	b := secondUser(t)
	_, resp := createCustom(t, a, map[string]any{"name": "Secret Lift", "muscle_group": "chest"})
	id := idOf(t, resp)
	_, resp = createCustom(t, b, map[string]any{"name": "Bs Own", "muscle_group": "chest"})
	bOwn := idOf(t, resp)
	idStr := fmt.Sprint(id)
	body := map[string]any{"name": "Hijack", "muscle_group": "chest"}

	type tc struct {
		name   string
		method string
		body   any
		h      func(c *gin.Context)
		want   int
		code   string
	}
	for _, x := range []tc{
		{"get", http.MethodGet, nil, th.GetExercise, 404, "EXERCISE_NOT_FOUND"},
		{"prs", http.MethodGet, nil, th.GetExercisePRs, 404, "EXERCISE_NOT_FOUND"},
		{"history", http.MethodGet, nil, th.GetExerciseHistory, 404, "EXERCISE_NOT_FOUND"},
		{"update", http.MethodPut, body, th.UpdateExercise, 404, "EXERCISE_NOT_FOUND"},
		{"archive", http.MethodPost, nil, th.ArchiveExercise, 404, "EXERCISE_NOT_FOUND"},
		{"unarchive", http.MethodPost, nil, th.UnarchiveExercise, 404, "EXERCISE_NOT_FOUND"},
		{"usage", http.MethodGet, nil, th.ExerciseUsage, 404, "EXERCISE_NOT_FOUND"},
		{"merge as source", http.MethodPost, map[string]any{"into_id": bOwn}, th.MergeExercise, 404, "EXERCISE_NOT_FOUND"},
	} {
		c, w := newContext(b, x.method, "/api/v1/exercises/"+idStr, x.body)
		setParam(c, "id", idStr)
		x.h(c)
		resp := decodeResponse(t, w)
		if w.Code != x.want || resp["code"] != x.code {
			t.Errorf("%s: %d %v", x.name, w.Code, resp)
		}
	}

	// As a merge target the id is not found either, but the error is about the target.
	c, w := newContext(b, http.MethodPost, "/", map[string]any{"into_id": id})
	setParam(c, "id", fmt.Sprint(bOwn))
	th.MergeExercise(c)
	if resp := decodeResponse(t, w); w.Code != http.StatusBadRequest || resp["code"] != "INVALID_MERGE_TARGET" {
		t.Errorf("merge as target: %d %v", w.Code, resp)
	}

	// Nothing of A's changed.
	c, w = newContext(a, http.MethodGet, "/", nil)
	setParam(c, "id", idStr)
	th.GetExercise(c)
	d := decodeResponse(t, w)["data"].(map[string]any)
	if w.Code != 200 || d["name"] != "Secret Lift" || d["archived"] != false {
		t.Errorf("owner's row changed: %d %v", w.Code, d)
	}

	// The catalog list never carries custom rows; mine=true carries only the caller's.
	c, w = newContext(a, http.MethodGet, "/api/v1/exercises?limit=50", nil)
	th.ListExercises(c)
	if got := decodeResponse(t, w)["data"].([]any); len(got) != 0 {
		t.Errorf("catalog list = %v", got)
	}
	c, w = newContext(a, http.MethodGet, "/api/v1/exercises?mine=true", nil)
	th.ListExercises(c)
	if got := decodeResponse(t, w)["data"].([]any); len(got) != 1 {
		t.Errorf("mine list = %v", got)
	}
}

func TestCustomExercise_LifecycleEndpoints(t *testing.T) {
	setupTestDB(t)
	a := createTestUser(t)
	_, resp := createCustom(t, a, map[string]any{"name": "Old", "muscle_group": "chest"})
	oldID := idOf(t, resp)
	_, resp = createCustom(t, a, map[string]any{"name": "New", "muscle_group": "chest"})
	newID := idOf(t, resp)
	seedWorkoutWithSet(t, a, oldID, 50, 5, 0)

	run := func(h func(*gin.Context), id int64, method string, body any) (int, map[string]any) {
		c, w := newContext(a, method, "/", body)
		setParam(c, "id", fmt.Sprint(id))
		h(c)
		return w.Code, decodeResponse(t, w)
	}
	if code, r := run(th.UpdateExercise, oldID, http.MethodPut, map[string]any{"name": "Older", "muscle_group": "lats", "equipment": "cable"}); code != 200 || r["data"].(map[string]any)["muscle_group"] != "lats" {
		t.Errorf("update: %d %v", code, r)
	}
	if code, r := run(th.UpdateExercise, oldID, http.MethodPut, map[string]any{"name": "new", "muscle_group": "lats"}); code != 409 || r["code"] != "EXERCISE_NAME_TAKEN" {
		t.Errorf("update to a taken name: %d %v", code, r)
	}
	if code, r := run(th.ExerciseUsage, oldID, http.MethodGet, nil); code != 200 || r["data"].(map[string]any)["workouts"] != float64(1) || r["data"].(map[string]any)["program_days"] != float64(0) {
		t.Errorf("usage: %d %v", code, r)
	}
	if code, r := run(th.MergeExercise, oldID, http.MethodPost, map[string]any{"into_id": oldID}); code != 400 || r["code"] != "INVALID_MERGE_TARGET" {
		t.Errorf("merge into self: %d %v", code, r)
	}
	code, r := run(th.MergeExercise, oldID, http.MethodPost, map[string]any{"into_id": newID})
	d, _ := r["data"].(map[string]any)
	if code != 200 || d["moved_workouts"] != float64(1) || d["moved_program_days"] != float64(0) || d["into"].(map[string]any)["id"] != float64(newID) {
		t.Errorf("merge: %d %v", code, r)
	}
	if code, r := run(th.GetExercise, oldID, http.MethodGet, nil); code != 200 || r["data"].(map[string]any)["archived"] != true || r["data"].(map[string]any)["merged_into_id"] != float64(newID) {
		t.Errorf("source after merge: %d %v", code, r)
	}
	if code, r := run(th.UnarchiveExercise, oldID, http.MethodPost, nil); code != 200 || r["data"].(map[string]any)["archived"] != false {
		t.Errorf("unarchive: %d %v", code, r)
	}
	if code, r := run(th.ArchiveExercise, oldID, http.MethodPost, nil); code != 200 || r["data"].(map[string]any)["archived"] != true {
		t.Errorf("archive: %d %v", code, r)
	}
	if code, r := run(th.UnarchiveExercise, oldID, http.MethodPost, nil); code != 200 {
		t.Errorf("unarchive again: %d %v", code, r)
	}

	catalog := createTestExercise(t)
	if code, r := run(th.UpdateExercise, catalog, http.MethodPut, map[string]any{"name": "x", "muscle_group": "chest"}); code != 403 || r["code"] != "EXERCISE_NOT_CUSTOM" {
		t.Errorf("edit catalog row: %d %v", code, r)
	}
	if code, r := run(th.ArchiveExercise, catalog, http.MethodPost, nil); code != 403 || r["code"] != "EXERCISE_NOT_CUSTOM" {
		t.Errorf("archive catalog row: %d %v", code, r)
	}
}

func TestCreateWorkout_RejectsOtherUsersCustomExercise(t *testing.T) {
	setupTestDB(t)
	a := createTestUser(t)
	b := secondUser(t)
	_, resp := createCustom(t, a, map[string]any{"name": "Secret Lift", "muscle_group": "chest"})
	id := idOf(t, resp)
	body := map[string]any{"name": "w", "exercises": []map[string]any{{"exercise_id": id, "sets": []map[string]any{{"set_number": 1, "reps": 5, "weight": 10}}}}}

	c, w := newContext(b, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)
	if r := decodeResponse(t, w); w.Code != 400 || r["code"] != "UNKNOWN_EXERCISES" {
		t.Errorf("create: %d %v", w.Code, r)
	}
	c, w = newContext(a, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("owner create: %d %s", w.Code, w.Body)
	}
	wid := int64(decodeResponse(t, w)["data"].(map[string]any)["id"].(float64))
	if ex := decodeResponse(t, mustRecord(t, th, a, wid))["data"].(map[string]any)["exercises"].([]any)[0].(map[string]any)["exercise"].(map[string]any); ex["is_custom"] != true {
		t.Errorf("workout exercise is_custom = %v", ex["is_custom"])
	}

	// An update by the owner that adds the id is fine; one by someone else never reaches the row.
	bw := createWorkoutFor(t, b)
	c, w = newContext(b, http.MethodPut, "/api/v1/workouts/"+fmt.Sprint(bw), body)
	setParam(c, "id", fmt.Sprint(bw))
	th.UpdateWorkout(c)
	if r := decodeResponse(t, w); w.Code != 400 || r["code"] != "UNKNOWN_EXERCISES" {
		t.Errorf("update: %d %v", w.Code, r)
	}
}

func mustRecord(t *testing.T, h *Handler, uid, wid int64) *httptest.ResponseRecorder {
	t.Helper()
	c, w := newContext(uid, http.MethodGet, "/", nil)
	setParam(c, "id", fmt.Sprint(wid))
	h.GetWorkout(c)
	return w
}

func createWorkoutFor(t *testing.T, uid int64) int64 {
	t.Helper()
	res, err := db.DB.Exec(`INSERT INTO workouts (user_id, name) VALUES (?, 'w')`, uid)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestCreateProgram_RejectsOtherUsersCustomExercise(t *testing.T) {
	setupTestDB(t)
	a := createTestUser(t)
	b := secondUser(t)
	_, resp := createCustom(t, a, map[string]any{"name": "Secret Lift", "muscle_group": "chest"})
	id := idOf(t, resp)
	body := map[string]any{"name": "P", "days": []map[string]any{{"exercises": []map[string]any{{"exercise_id": id, "sets": []map[string]any{}}}}}}

	c, w := newContext(b, http.MethodPost, "/api/v1/programs", body)
	th.CreateProgram(c)
	if r := decodeResponse(t, w); w.Code != 400 || r["code"] != "UNKNOWN_EXERCISES" {
		t.Errorf("create: %d %v", w.Code, r)
	}
	c, w = newContext(a, http.MethodPost, "/api/v1/programs", body)
	th.CreateProgram(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("owner create: %d %s", w.Code, w.Body)
	}
	pid := int64(decodeResponse(t, w)["data"].(map[string]any)["id"].(float64))

	other := map[string]any{"name": "P2", "days": []map[string]any{}}
	c, w = newContext(b, http.MethodPost, "/api/v1/programs", other)
	th.CreateProgram(c)
	bp := int64(decodeResponse(t, w)["data"].(map[string]any)["id"].(float64))
	c, w = newContext(b, http.MethodPut, "/", body)
	setParam(c, "id", fmt.Sprint(bp))
	th.UpdateProgram(c)
	if r := decodeResponse(t, w); w.Code != 400 || r["code"] != "UNKNOWN_EXERCISES" {
		t.Errorf("update: %d %v", w.Code, r)
	}
	_ = pid
}

func TestDeleteAccount_RemovesCustomExercises(t *testing.T) {
	setupTestDB(t)
	a := createTestUser(t)
	b := secondUser(t)
	createCustom(t, a, map[string]any{"name": "Mine", "muscle_group": "chest"})
	_, resp := createCustom(t, a, map[string]any{"name": "Used", "muscle_group": "chest"})
	seedWorkoutWithSet(t, a, idOf(t, resp), 50, 5, 0)
	createCustom(t, b, map[string]any{"name": "Keep", "muscle_group": "chest"})

	d, err := th.s.User.CountData(a)
	if err != nil || d.CustomExercises != 2 {
		t.Fatalf("CountData = %+v, %v", d, err)
	}
	if err := th.s.User.Delete(a); err != nil {
		t.Fatal(err)
	}
	var mine, theirs int
	db.DB.QueryRow(`SELECT COUNT(*) FROM exercises WHERE owner_user_id = ?`, a).Scan(&mine)
	db.DB.QueryRow(`SELECT COUNT(*) FROM exercises WHERE owner_user_id = ?`, b).Scan(&theirs)
	if mine != 0 || theirs != 1 {
		t.Errorf("custom rows left: deleted user %d, other user %d", mine, theirs)
	}
}

func TestServerInfo_AdvertisesCustomExercises(t *testing.T) {
	setupTestDB(t)
	c, w := newContext(0, "GET", "/api/v1/info", nil)
	th.ServerInfo(c)
	if got := decodeResponse(t, w)["data"].(map[string]any)["custom_exercises"]; got != true {
		t.Errorf("custom_exercises = %v, want true", got)
	}
}

// A workout begun before a merge still names the merged source when it is saved; the write
// lands on the target (following a chain), so the history the merge joined stays joined.
func TestSaveAfterMerge_WritesToTheMergeTarget(t *testing.T) {
	setupTestDB(t)
	a := createTestUser(t)
	ids := make([]int64, 3)
	for i, n := range []string{"Lift A", "Lift B", "Lift C"} {
		_, resp := createCustom(t, a, map[string]any{"name": n, "muscle_group": "chest"})
		ids[i] = idOf(t, resp)
	}
	if _, err := th.s.Exercise.Merge(a, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	if _, err := th.s.Exercise.Merge(a, ids[1], ids[2]); err != nil {
		t.Fatal(err)
	}
	body := map[string]any{"name": "late save", "exercises": []map[string]any{{"exercise_id": ids[0], "sets": []map[string]any{{"set_number": 1, "reps": 5, "weight": 10}}}}}
	c, w := newContext(a, http.MethodPost, "/api/v1/workouts", body)
	th.CreateWorkout(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	wid := int64(decodeResponse(t, w)["data"].(map[string]any)["id"].(float64))
	got := decodeResponse(t, mustRecord(t, th, a, wid))["data"].(map[string]any)["exercises"].([]any)[0].(map[string]any)["exercise_id"]
	if int64(got.(float64)) != ids[2] {
		t.Errorf("saved exercise_id = %v, want the end of the chain %d", got, ids[2])
	}

	prog := map[string]any{"name": "p", "days": []map[string]any{{"name": "d", "exercises": []map[string]any{{"exercise_id": ids[1], "sets": []map[string]any{}}}}}}
	c, w = newContext(a, http.MethodPost, "/api/v1/programs", prog)
	th.CreateProgram(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("program: %d %s", w.Code, w.Body)
	}
	day := decodeResponse(t, w)["data"].(map[string]any)["days"].([]any)[0].(map[string]any)
	if pe := day["exercises"].([]any)[0].(map[string]any)["exercise_id"]; int64(pe.(float64)) != ids[2] {
		t.Errorf("program exercise_id = %v, want %d", pe, ids[2])
	}
}

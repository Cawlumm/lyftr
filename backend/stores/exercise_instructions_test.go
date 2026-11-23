package stores

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/Cawlumm/lyftr-backend/models"
)

func TestCustomInstructions_Precedence(t *testing.T) {
	steps := func(s ...string) []string { return append([]string{}, s...) }
	cases := []struct {
		name      string
		req       models.CreateExerciseRequest
		wantSteps []string
		wantDesc  string
	}{
		{"instructions only", models.CreateExerciseRequest{Instructions: steps("A", "B")}, steps("A", "B"), "1. A\n2. B"},
		{"description only (older app)", models.CreateExerciseRequest{Description: "1. A\n2. B"}, steps("A", "B"), "1. A\n2. B"},
		{"description only, unnumbered", models.CreateExerciseRequest{Description: "A\n\nB"}, steps("A", "B"), "1. A\n2. B"},
		{"both: instructions win", models.CreateExerciseRequest{Description: "Old text", Instructions: steps("New")}, steps("New"), "1. New"},
		{"explicit empty list clears", models.CreateExerciseRequest{Description: "Old text", Instructions: []string{}}, steps(), ""},
		{"neither", models.CreateExerciseRequest{}, steps(), ""},
		{"blank steps dropped", models.CreateExerciseRequest{Instructions: steps(" A ", "", "B")}, steps("A", "B"), "1. A\n2. B"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s, conn, uid, _ := customStore(t)
			c.req.Name, c.req.MuscleGroup = "Lift", "chest"
			e, err := s.CreateCustom(uid, c.req)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(e.Instructions, c.wantSteps) || e.Description != c.wantDesc {
				t.Errorf("create = (%#v, %q), want (%#v, %q)", e.Instructions, e.Description, c.wantSteps, c.wantDesc)
			}

			// Update starts from filled steps so a clear is visible.
			up := c.req
			up.Name = "Lift"
			if _, err := s.UpdateCustom(uid, e.ID, models.CreateExerciseRequest{Name: "Lift", MuscleGroup: "chest", Instructions: steps("Prior")}); err != nil {
				t.Fatal(err)
			}
			e, err = s.UpdateCustom(uid, e.ID, up)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(e.Instructions, c.wantSteps) || e.Description != c.wantDesc {
				t.Errorf("update = (%#v, %q), want (%#v, %q)", e.Instructions, e.Description, c.wantSteps, c.wantDesc)
			}
			var raw, desc string
			conn.QueryRow(`SELECT instructions, description FROM exercises WHERE id = ?`, e.ID).Scan(&raw, &desc)
			var stored []string
			if err := json.Unmarshal([]byte(raw), &stored); err != nil || !reflect.DeepEqual(stored, c.wantSteps) || desc != c.wantDesc {
				t.Errorf("stored = (%q, %q), want (%v, %q)", raw, desc, c.wantSteps, c.wantDesc)
			}
		})
	}
}

func TestExercise_InstructionsSerializeAsEmptyList(t *testing.T) {
	s, _, uid, _ := customStore(t)
	e := mustCreate(t, s, uid, "Bare")
	raw, _ := json.Marshal(e)
	var m map[string]any
	json.Unmarshal(raw, &m)
	if got, ok := m["instructions"].([]any); !ok || len(got) != 0 {
		t.Errorf("instructions = %#v, want []", m["instructions"])
	}
}

func TestMaterialize_StoresListAndNumberedDescription(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	base := materialize(t, s, "en", served("uuid-1", "Squat", "en", []string{" Stand tall. ", "", "Sit down."}, "en"))

	if want := []string{"Stand tall.", "Sit down."}; !reflect.DeepEqual(base[0].Instructions, want) {
		t.Errorf("returned instructions = %#v, want %#v", base[0].Instructions, want)
	}
	var raw, desc string
	conn.QueryRow(`SELECT instructions, description FROM exercises WHERE id = ?`, base[0].ID).Scan(&raw, &desc)
	if raw != `["Stand tall.","Sit down."]` || desc != "1. Stand tall.\n2. Sit down." {
		t.Errorf("stored = (%q, %q)", raw, desc)
	}

	// A re-sync refreshes both columns together.
	materialize(t, s, "en", served("uuid-1", "Squat", "en", []string{"Only."}, "en"))
	conn.QueryRow(`SELECT instructions, description FROM exercises WHERE id = ?`, base[0].ID).Scan(&raw, &desc)
	if raw != `["Only."]` || desc != "1. Only." {
		t.Errorf("after re-sync = (%q, %q)", raw, desc)
	}

	// An exercise with no steps stores an empty list, not null.
	none := materialize(t, s, "en", served("uuid-2", "Plank", "en", nil, "en"))
	if none[0].Instructions == nil || len(none[0].Instructions) != 0 {
		t.Errorf("no steps = %#v, want empty non-nil", none[0].Instructions)
	}
}

func TestMaterialize_TranslationStoresBothColumns(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	base := materialize(t, s, "en", englishSquat())
	materialize(t, s, "es", spanishSquat())

	var raw, desc string
	conn.QueryRow(`SELECT instructions, description FROM exercise_translations`).Scan(&raw, &desc)
	if raw != `["Ponte recto.","Siéntate."]` || desc != "1. Ponte recto.\n2. Siéntate." {
		t.Errorf("translation = (%q, %q)", raw, desc)
	}

	// English base is untouched by the Spanish pass.
	var enRaw string
	conn.QueryRow(`SELECT instructions FROM exercises WHERE id = ?`, base[0].ID).Scan(&enRaw)
	if enRaw != `["Stand tall.","Sit down."]` {
		t.Errorf("base instructions = %q", enRaw)
	}
}

func TestGet_LocalizedInstructionsFallBackToEnglish(t *testing.T) {
	conn := testDB(t)
	s := NewExerciseStore(conn)
	base := materialize(t, s, "en", englishSquat())
	id := base[0].ID

	cases := []struct {
		name   string
		locale string
		want   []string
	}{
		{"english reader", "en", []string{"Stand tall.", "Sit down."}},
		{"no translation yet falls back", "es", []string{"Stand tall.", "Sit down."}},
	}
	for _, c := range cases {
		if got := mustGet(t, s, id, c.locale).Instructions; !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: %#v, want %#v", c.name, got, c.want)
		}
	}

	materialize(t, s, "es", spanishSquat())
	if got := mustGet(t, s, id, "es").Instructions; !reflect.DeepEqual(got, []string{"Ponte recto.", "Siéntate."}) {
		t.Errorf("es read = %#v, want the translation's list", got)
	}
	if got := mustGet(t, s, id, "es-MX").Instructions; !reflect.DeepEqual(got, []string{"Ponte recto.", "Siéntate."}) {
		t.Errorf("es-MX read = %#v, want the es list", got)
	}
	if got := mustGet(t, s, id, "en").Instructions; !reflect.DeepEqual(got, []string{"Stand tall.", "Sit down."}) {
		t.Errorf("en read = %#v, want the base list", got)
	}

	// Name translated but instructions fell back to English: the translation row's list
	// is '[]', so the base list shows.
	materialize(t, s, "es", served("uuid-1", "Sentadilla", "es", []string{"Stand tall.", "Sit down."}, "en"))
	if got := mustGet(t, s, id, "es").Instructions; !reflect.DeepEqual(got, []string{"Stand tall.", "Sit down."}) {
		t.Errorf("name-only translation: %#v, want the English list", got)
	}
}

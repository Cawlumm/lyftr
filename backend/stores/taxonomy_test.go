package stores

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

// What open-exercise-db uses, counted over the whole published English catalog (873 exercises,
// https://cawlumm.github.io/open-exercise-db/v1/, 2026-11): muscle_group and secondary_muscles
// draw on the same 17. Inlined because the e2e stub is a 64-row slice of it and cannot show
// that a value is never used.
var (
	catalogMuscles = []string{
		"abdominals", "abductors", "adductors", "biceps", "calves", "chest", "forearms", "glutes",
		"hamstrings", "lats", "lower-back", "middle-back", "neck", "quadriceps", "shoulders", "traps", "triceps",
	}
	catalogEquipment = []string{
		"bands", "barbell", "body-only", "cable", "dumbbell", "e-z-curl-bar", "exercise-ball",
		"foam-roll", "kettlebells", "machine", "medicine-ball", "none", "other",
	}
	catalogCategories = []string{
		"cardio", "olympic-weightlifting", "plyometrics", "powerlifting", "strength", "stretching", "strongman",
	}
)

func sorted(s []string) []string {
	out := slices.Clone(s)
	slices.Sort(out)
	return out
}

func sameSet(t *testing.T, what string, got, want []string) {
	t.Helper()
	if !slices.Equal(sorted(got), sorted(want)) {
		t.Errorf("%s:\n got  %v\n want %v", what, sorted(got), sorted(want))
	}
	if len(slices.Compact(sorted(got))) != len(got) {
		t.Errorf("%s holds a duplicate: %v", what, got)
	}
}

// A custom exercise may use what the catalog uses and nothing else, except equipment "none",
// which the form leaves to body-only.
func TestTaxonomy_CustomSetsAreWhatTheCatalogUses(t *testing.T) {
	sameSet(t, "CustomMuscles", CustomMuscles, catalogMuscles)
	sameSet(t, "CustomEquipment", CustomEquipment, slices.DeleteFunc(slices.Clone(catalogEquipment), func(s string) bool { return s == "none" }))
	sameSet(t, "CustomCategories", CustomCategories, catalogCategories)
}

// The app's form offers what customExerciseTaxonomy.json lists; the server must accept exactly that.
func TestTaxonomy_CustomSetsMatchTheApp(t *testing.T) {
	raw, err := os.ReadFile("../../packages/shared/src/utils/customExerciseTaxonomy.json")
	if err != nil {
		t.Fatal(err)
	}
	var app struct {
		Muscles    []string `json:"muscles"`
		Equipment  []string `json:"equipment"`
		Categories []string `json:"categories"`
	}
	if err := json.Unmarshal(raw, &app); err != nil {
		t.Fatal(err)
	}
	sameSet(t, "muscles", CustomMuscles, app.Muscles)
	sameSet(t, "equipment", CustomEquipment, app.Equipment)
	sameSet(t, "categories", CustomCategories, app.Categories)
}

// The e2e stub is a recorded slice of the real catalog, so every value it serves must be one the
// catalog lists above know.
func TestTaxonomy_MatchesOedbStubFixture(t *testing.T) {
	raw, err := os.ReadFile("../../apps/app/e2e/oedb-stub/catalog.json")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Exercises []struct {
			MuscleGroup      string   `json:"muscle_group"`
			SecondaryMuscles []string `json:"secondary_muscles"`
			Equipment        string   `json:"equipment"`
			Category         string   `json:"category"`
		} `json:"exercises"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	if len(doc.Exercises) == 0 {
		t.Fatal("fixture holds no exercises")
	}
	for _, e := range doc.Exercises {
		if !inList(catalogMuscles, e.MuscleGroup) {
			t.Errorf("muscle_group %q is not in catalogMuscles", e.MuscleGroup)
		}
		for _, m := range e.SecondaryMuscles {
			if !inList(catalogMuscles, m) {
				t.Errorf("secondary muscle %q is not in catalogMuscles", m)
			}
		}
		if !inList(catalogEquipment, e.Equipment) {
			t.Errorf("equipment %q is not in catalogEquipment", e.Equipment)
		}
		if !inList(catalogCategories, e.Category) {
			t.Errorf("category %q is not in catalogCategories", e.Category)
		}
	}
}

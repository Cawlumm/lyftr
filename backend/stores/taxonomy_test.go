package stores

import (
	"encoding/json"
	"os"
	"testing"
)

// The lists a custom exercise may use must cover every value oedb serves, or the app's own
// catalog exercises would fail the check a custom one passes. The e2e stub is a recorded
// slice of the real catalog.
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
		if !inList(MuscleGroups, e.MuscleGroup) {
			t.Errorf("muscle_group %q is not in MuscleGroups", e.MuscleGroup)
		}
		for _, m := range e.SecondaryMuscles {
			if !inList(MuscleGroups, m) {
				t.Errorf("secondary muscle %q is not in MuscleGroups", m)
			}
		}
		if !inList(Equipment, e.Equipment) {
			t.Errorf("equipment %q is not in Equipment", e.Equipment)
		}
		if !inList(Categories, e.Category) {
			t.Errorf("category %q is not in Categories", e.Category)
		}
	}
}

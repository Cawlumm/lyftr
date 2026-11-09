package stores

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type supersetCase struct {
	Name       string `json:"name"`
	Input      []*int `json:"input"`
	Normalised []*int `json:"normalised"`
	Contiguous bool   `json:"contiguous"`
}

func loadSupersetCases(t *testing.T) []supersetCase {
	t.Helper()
	raw, err := os.ReadFile("../../packages/shared/src/utils/supersets.fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []supersetCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) == 0 {
		t.Fatal("no fixture cases")
	}
	return f.Cases
}

func render(g []*int) []any {
	out := make([]any, len(g))
	for i, v := range g {
		if v != nil {
			out[i] = *v
		}
	}
	return out
}

func TestNormaliseSupersetGroups_matchesSharedFixtures(t *testing.T) {
	for _, tc := range loadSupersetCases(t) {
		if !tc.Contiguous {
			continue
		}
		t.Run(tc.Name, func(t *testing.T) {
			got := normaliseSupersetGroups(tc.Input)
			if !reflect.DeepEqual(render(got), render(tc.Normalised)) {
				t.Errorf("normalise(%v) = %v, want %v", render(tc.Input), render(got), render(tc.Normalised))
			}
		})
	}
}

func TestNormaliseSupersetGroups_doesNotMutateInput(t *testing.T) {
	five := 5
	in := []*int{&five, nil}
	normaliseSupersetGroups(in)
	if *in[0] != 5 {
		t.Errorf("input mutated to %d", *in[0])
	}
}

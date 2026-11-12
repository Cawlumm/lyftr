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

func TestSupersetsContiguous_matchesSharedFixtures(t *testing.T) {
	for _, tc := range loadSupersetCases(t) {
		if got := SupersetsContiguous(tc.Input); got != tc.Contiguous {
			t.Errorf("%s: contiguous = %v, want %v", tc.Name, got, tc.Contiguous)
		}
	}
}

func ints(v ...any) []*int {
	out := make([]*int, len(v))
	for i, x := range v {
		if x != nil {
			n := x.(int)
			out[i] = &n
		}
	}
	return out
}

func TestCarrySupersetGroups(t *testing.T) {
	cases := []struct {
		name       string
		prevIDs    []int64
		prevGroups []*int
		ids        []int64
		want       []any
	}{
		{"unchanged rows keep their labels", []int64{1, 2, 3}, ints(1, 1, nil), []int64{1, 2, 3}, []any{1, 1, nil}},
		{"a pair reordered stays a pair", []int64{1, 2, 3}, ints(1, 1, nil), []int64{2, 1, 3}, []any{1, 1, nil}},
		{"an added row takes no label", []int64{1, 2}, ints(1, 1), []int64{1, 2, 9}, []any{1, 1, nil}},
		{"a removed member leaves its partner labelled (normalise drops it)", []int64{1, 2, 3}, ints(1, 1, nil), []int64{1, 3}, []any{1, nil}},
		{"repeats match by occurrence", []int64{5, 5, 6, 5}, ints(1, 1, nil, nil), []int64{5, 5, 6, 5}, []any{1, 1, nil, nil}},
		{"a row inserted inside a group carries nothing", []int64{1, 2}, ints(1, 1), []int64{1, 9, 2}, []any{nil, nil, nil}},
		{"a group split by a reorder carries nothing", []int64{1, 2, 3}, ints(1, 1, nil), []int64{1, 3, 2}, []any{nil, nil, nil}},
		{"nothing held, nothing carried", nil, nil, []int64{1, 2}, []any{nil, nil}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := carrySupersetGroups(tc.prevIDs, tc.prevGroups, tc.ids)
			if !reflect.DeepEqual(render(got), tc.want) {
				t.Errorf("carry = %v, want %v", render(got), tc.want)
			}
		})
	}
}

package models

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestStepsFromText(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"numbered dots", "1. Stand tall.\n2. Sit down.", []string{"Stand tall.", "Sit down."}},
		{"numbered parens", "1) Stand tall.\n2) Sit down.", []string{"Stand tall.", "Sit down."}},
		{"two digit numbers", "10. Ten", []string{"Ten"}},
		{"unnumbered", "Stand tall.\nSit down.", []string{"Stand tall.", "Sit down."}},
		{"blank lines dropped", "1. A\n\n\n2. B\n", []string{"A", "B"}},
		{"whitespace trimmed", "  1.   A  \r\n\t2. B\t", []string{"A", "B"}},
		{"a step that starts with a number keeps it", "1.5 reps hold\n2.B", []string{"1.5 reps hold", "2.B"}},
		{"number without text dropped", "1.\n2. B", []string{"B"}},
		{"inner numbers kept", "Do 3. reps of 5) things", []string{"Do 3. reps of 5) things"}},
		{"empty", "", []string{}},
		{"only whitespace", " \n \t\n", []string{}},
	}
	for _, c := range cases {
		got := StepsFromText(c.in)
		if got == nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: StepsFromText(%q) = %#v, want %#v", c.name, c.in, got, c.want)
		}
	}
}

func TestStepsToText(t *testing.T) {
	cases := []struct {
		steps []string
		want  string
	}{
		{[]string{"A", "B"}, "1. A\n2. B"},
		{[]string{"Only"}, "1. Only"},
		{[]string{}, ""},
		{nil, ""},
	}
	for _, c := range cases {
		if got := StepsToText(c.steps); got != c.want {
			t.Errorf("StepsToText(%v) = %q, want %q", c.steps, got, c.want)
		}
	}
}

func TestSteps_RoundTrip(t *testing.T) {
	for _, steps := range [][]string{{"A"}, {"A", "B", "C"}, {"Keep 3. inside"}, {}} {
		if got := StepsFromText(StepsToText(steps)); !reflect.DeepEqual(got, steps) {
			t.Errorf("round trip of %v = %v", steps, got)
		}
	}
}

func TestCleanSteps(t *testing.T) {
	got := CleanSteps([]string{" a ", "", "  ", "b"})
	if !reflect.DeepEqual(got, []string{"a", "b"}) {
		t.Errorf("got %v", got)
	}
	if got := CleanSteps(nil); got == nil || len(got) != 0 {
		t.Errorf("CleanSteps(nil) = %#v, want empty non-nil", got)
	}
}

func TestExerciseJSONNeverNullInstructions(t *testing.T) {
	raw, err := json.Marshal(struct{ E Exercise }{Exercise{ID: 1, Name: "Bench"}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"instructions":[]`) {
		t.Errorf("an Exercise built without instructions serialized as %s, want \"instructions\":[]", raw)
	}
	raw, _ = json.Marshal(Exercise{Instructions: []string{"A"}})
	if !strings.Contains(string(raw), `"instructions":["A"]`) {
		t.Errorf("got %s", raw)
	}
}

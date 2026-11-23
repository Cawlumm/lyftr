package models

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

// Limits on a custom exercise's instruction list. The joined text must also fit
// CreateExerciseRequest.Description's own cap, which is why it is checked too.
const (
	MaxInstructionSteps = 30
	MaxInstructionChars = 300
	MaxInstructionsText = 2000
)

// "1. " or "2) " only: a step that starts with a number ("1.5 reps hold") keeps it.
var leadingStepNumber = regexp.MustCompile(`^\d+[.)](\s+|$)`)

// StepsFromText parses a numbered or plain multi-line block into steps: one per
// non-empty line, with a leading "1." or "1)" dropped. It always returns a non-nil slice.
// The TS instructionSteps in packages/shared mirrors it.
//
// It lives here, not in stores, because the db package's backfill needs it and stores
// imports db.
func StepsFromText(s string) []string {
	steps := []string{}
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimSpace(leadingStepNumber.ReplaceAllString(line, ""))
		if line != "" {
			steps = append(steps, line)
		}
	}
	return steps
}

// StepsToText joins steps as "1. a\n2. b", the shape the description column holds so
// that app builds which only read description still show numbered steps.
func StepsToText(steps []string) string {
	var b strings.Builder
	for i, step := range steps {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(strconv.Itoa(i + 1))
		b.WriteString(". ")
		b.WriteString(step)
	}
	return b.String()
}

// CleanSteps trims each step and drops the empty ones. It always returns a non-nil slice.
// TextLines splits a custom exercise's instructions as the user typed them: one entry per
// non-blank line, trimmed, numbering left alone (only the catalog's steps are numbered for them).
func TextLines(s string) []string {
	return CleanSteps(strings.Split(strings.ReplaceAll(s, "\r", "\n"), "\n"))
}

// LinesToText is the inverse: the lines as typed, one per line, for description.
func LinesToText(lines []string) string {
	return strings.Join(lines, "\n")
}

func CleanSteps(steps []string) []string {
	out := make([]string, 0, len(steps))
	for _, s := range steps {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// MarshalJSON keeps instructions a list on the wire wherever an Exercise is built (the
// workout and program loaders fill only a few columns): a client mapping over it must never
// meet null.
func (e Exercise) MarshalJSON() ([]byte, error) {
	type plain Exercise
	if e.Instructions == nil {
		e.Instructions = []string{}
	}
	return json.Marshal(plain(e))
}

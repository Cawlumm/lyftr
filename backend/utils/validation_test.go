package utils

import (
	"encoding/json"
	"strings"
	"testing"
)

// The rule these all serve: whatever we put in "error" is read by a person, because the
// clients prefer the server's message over anything they would write themselves. Anything
// that names a Go type, a struct field, or a validator tag has escaped from the wrong side
// of the boundary.
type signup struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
}

type entry struct {
	Meal     string  `json:"meal" validate:"required,oneof=breakfast lunch dinner snacks"`
	Calories float64 `json:"calories" validate:"gte=0"`
	Servings float64 `json:"servings" validate:"gt=0,lte=2000"`
	Note     string  `json:"note" validate:"max=500"`
}

func messageFor(t *testing.T, v any) string {
	t.Helper()
	err := NewValidator().Struct(v)
	if err == nil {
		t.Fatal("expected the struct to fail validation")
	}
	return ValidationMessage(err)
}

func TestValidationMessageNeverLeaksTheStructDump(t *testing.T) {
	msg := messageFor(t, signup{Email: "notanemail", Password: "abc"})

	for _, leak := range []string{"Key:", "Error:Field validation", "tag", "signup", "Email'"} {
		if strings.Contains(msg, leak) {
			t.Fatalf("message leaks internals (%q): %s", leak, msg)
		}
	}
}

func TestValidationMessageUsesJSONFieldNames(t *testing.T) {
	// The Go field is CalorieTarget-style; the name a user has ever seen is the JSON one.
	type settings struct {
		CalorieTarget int `json:"calorie_target" validate:"required"`
	}
	msg := messageFor(t, settings{})

	if msg != "Calorie target is required." {
		t.Fatalf("got %q", msg)
	}
}

// A sign-up with two problems should say both. Reporting only the first means the user
// fixes it, submits again, and is turned away a second time for something we already knew.
func TestValidationMessageReportsEveryFailedRule(t *testing.T) {
	msg := messageFor(t, signup{Email: "notanemail", Password: "abc"})

	if !strings.Contains(msg, "Email must be a valid email address.") {
		t.Fatalf("missing the email sentence: %s", msg)
	}
	if !strings.Contains(msg, "Password must be at least 8 characters.") {
		t.Fatalf("missing the password sentence: %s", msg)
	}
}

func TestValidationMessagePerTag(t *testing.T) {
	cases := []struct {
		name string
		in   any
		want string
	}{
		{"required", signup{Password: "longenough"}, "Email is required."},
		{"email", signup{Email: "nope", Password: "longenough"}, "Email must be a valid email address."},
		{"min on a string counts characters", signup{Email: "a@b.co", Password: "short"}, "Password must be at least 8 characters."},
		{"oneof lists the options", entry{Meal: "brunch", Servings: 1}, "Meal must be one of: breakfast, lunch, dinner, snacks."},
		{"gte=0 reads as a floor, not a bound", entry{Meal: "lunch", Calories: -5, Servings: 1}, "Calories can't be negative."},
		{"gt=0 says greater than zero", entry{Meal: "lunch", Servings: 0}, "Servings must be greater than zero."},
		{"lte gives the ceiling", entry{Meal: "lunch", Servings: 5000}, "Servings must be 2000 or less."},
		{"max on a string counts characters", entry{Meal: "lunch", Servings: 1, Note: strings.Repeat("x", 501)}, "Note must be 500 characters or fewer."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := messageFor(t, tc.in); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// Not a validator failure at all — a body we could not decode. "unexpected EOF" is the Go
// runtime talking to itself.
func TestBindMessage(t *testing.T) {
	var target signup

	cases := []struct {
		name string
		body string
		want string
	}{
		{"truncated", `{"email":`, "The request body wasn't valid JSON."},
		{"garbage", `not json at all`, "The request body wasn't valid JSON."},
		{"empty", ``, "The request body was empty."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := json.Unmarshal([]byte(tc.body), &target)
			if tc.body == "" {
				err = json.NewDecoder(strings.NewReader("")).Decode(&target)
			}
			if err == nil {
				t.Fatal("expected a decode error")
			}
			if got := BindMessage(err); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestBindMessageNamesTheFieldWithTheWrongType(t *testing.T) {
	var target struct {
		Calories float64 `json:"calories"`
	}
	err := json.Unmarshal([]byte(`{"calories":"lots"}`), &target)
	if err == nil {
		t.Fatal("expected a type error")
	}

	got := BindMessage(err)
	if !strings.Contains(got, "Calories") {
		t.Fatalf("should name the offending field: %s", got)
	}
	if strings.Contains(got, "UnmarshalTypeError") {
		t.Fatalf("leaks the Go error type: %s", got)
	}
}

// An unmapped tag must still produce a sentence rather than falling through to the dump.
func TestValidationMessageFallsBackWithoutLeaking(t *testing.T) {
	type odd struct {
		Code string `json:"code" validate:"alphanum"`
	}
	msg := messageFor(t, odd{Code: "!!!"})

	if msg != "Code isn't valid." {
		t.Fatalf("got %q", msg)
	}
}

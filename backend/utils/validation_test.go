package utils

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
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

type workoutSet struct {
	Weight float64 `json:"weight" validate:"required"`
}

type listed struct {
	Items []int `json:"items" validate:"max=500"`
}

func messageFor(t *testing.T, v any) string {
	t.Helper()
	err := NewValidator().Struct(v)
	if err == nil {
		t.Fatal("expected the struct to fail validation")
	}
	return validationMessage(err)
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

	if msg != "Calorie target is a required field." {
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
	if !strings.Contains(msg, "Password must be at least 8 characters in length.") {
		t.Fatalf("missing the password sentence: %s", msg)
	}
}

// Most of these sentences are the library's, not ours — pinned so a validator upgrade
// cannot quietly reword what a user reads. The oneof case is ours: the default renders the
// options as a Go slice.
func TestValidationMessagePerTag(t *testing.T) {
	cases := []struct {
		name string
		in   any
		want string
	}{
		{"required", signup{Password: "longenough"}, "Email is a required field."},
		{"email", signup{Email: "nope", Password: "longenough"}, "Email must be a valid email address."},
		{"min on a string counts characters", signup{Email: "a@b.co", Password: "short"}, "Password must be at least 8 characters in length."},
		{"oneof lists the options", entry{Meal: "brunch", Servings: 1}, "Meal must be one of: breakfast, lunch, dinner, snacks."},
		{"gte=0 reads as a floor", entry{Meal: "lunch", Calories: -5, Servings: 1}, "Calories must be 0 or greater."},
		{"gt=0 excludes the floor", entry{Meal: "lunch", Servings: 0}, "Servings must be greater than 0."},
		{"lte gives the ceiling", entry{Meal: "lunch", Servings: 5000}, "Servings must be 2,000 or less."},
		{"required on a number", workoutSet{}, "Weight is a required field."},
		{"max on a list counts items", listed{Items: make([]int, 501)}, "Items must contain at maximum 500 items."},
		{"max on a string counts characters", entry{Meal: "lunch", Servings: 1, Note: strings.Repeat("x", 501)}, "Note must be a maximum of 500 characters in length."},
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
func TestBindFailureForUndecodableBodies(t *testing.T) {
	var target signup

	cases := []struct {
		name string
		body string
		want Code
		text string
	}{
		{"truncated", `{"email":`, codeBodyNotJSON, "The request body wasn't valid JSON."},
		{"garbage", `not json at all`, codeBodyNotJSON, "The request body wasn't valid JSON."},
		{"empty", ``, codeBodyEmpty, "The request body was empty."},
		{"top-level wrong type", `[1]`, codeBodyWrongType, "The request body had a field of the wrong type."},
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
			code, params := bindFailure(err)
			if code.ID != tc.want.ID || code.Message(params) != tc.text {
				t.Fatalf("got %s %q, want %s %q", code.ID, code.Message(params), tc.want.ID, tc.text)
			}
		})
	}

	if code, _ := bindFailure(errors.New("x")); code.ID != codeBodyUnreadable.ID {
		t.Fatalf("an unknown error should be %s, got %s", codeBodyUnreadable.ID, code.ID)
	}
}

// The field is named, and the SHAPE it wanted is said in English. The previous version of
// this test only rejected "UnmarshalTypeError" — the name of the error type — which is why
// "expected float64" reached users unnoticed. Go type names are checked for explicitly now.
func TestBindFailureNamesTheFieldWithTheWrongType(t *testing.T) {
	type set struct {
		Weight float64 `json:"weight"`
	}
	type exercise struct {
		Sets []set `json:"sets"`
	}
	cases := []struct {
		name  string
		into  any
		body  string
		want  Code
		field string
		text  string
	}{
		{"number", &struct {
			Calories float64 `json:"calories"`
		}{}, `{"calories":"lots"}`, codeNotANumber, "calories", "Calories must be a number."},
		{"text", &struct {
			Name string `json:"name"`
		}{}, `{"name":12}`, codeNotText, "name", "Name must be text."},
		{"boolean", &struct {
			IsWarmup bool `json:"is_warmup"`
		}{}, `{"is_warmup":"yes"}`, codeNotTrueOrFalse, "is_warmup", "Is warmup must be true or false."},
		{"list", &struct {
			Sets []int `json:"sets"`
		}{}, `{"sets":3}`, codeNotAList, "sets", "Sets must be a list."},
		{"object", &struct {
			Set set `json:"set"`
		}{}, `{"set":3}`, codeNotAnObject, "set", "Set must be an object."},
		{"pointer is followed", &struct {
			ProgramID *int64 `json:"program_id"`
		}{}, `{"program_id":"seven"}`, codeNotANumber, "program_id", "Program id must be a number."},
		{"nested path", &struct {
			Exercises []exercise `json:"exercises"`
		}{}, `{"exercises":[{"sets":[{"weight":"x"}]}]}`, codeNotANumber, "exercises.sets.weight", "Exercises.sets.weight must be a number."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := json.Unmarshal([]byte(tc.body), tc.into)
			if err == nil {
				t.Fatal("expected a type error")
			}
			code, params := bindFailure(err)
			if code.ID != tc.want.ID || params["field"] != tc.field {
				t.Fatalf("got %s %v, want %s field %q", code.ID, params, tc.want.ID, tc.field)
			}
			got := code.Message(params)
			if got != tc.text {
				t.Fatalf("got %q, want %q", got, tc.text)
			}
			for _, goName := range []string{"float64", "int64", "int", "string", "bool", "[]", "*", "UnmarshalTypeError"} {
				if strings.Contains(got, goName) {
					t.Fatalf("leaks the Go type %q: %s", goName, got)
				}
			}
		})
	}
}

// `binding` tags surface validator failures through the bind; they answer 400 INVALID_FIELDS
// with the same violations a 422 carries.
func TestBindErrorWithAValidatorFailure(t *testing.T) {
	type body struct {
		Data string `json:"data" validate:"required"`
	}
	err := NewValidator().Struct(body{})

	c, w := testCtx()
	BindError(c, err)

	b := bodyOf(t, w)
	params, _ := b["params"].(map[string]any)
	if w.Code != 400 || b["code"] != "INVALID_FIELDS" || b["error"] != "Data is a required field." || params["violations"] == nil {
		t.Fatalf("BindError = %d %v", w.Code, b)
	}

	c, w = testCtx()
	BindError(c, io.EOF)
	if b := bodyOf(t, w); w.Code != 400 || b["code"] != "BODY_EMPTY" || b["params"] != nil {
		t.Fatalf("BindError(EOF) = %d %v", w.Code, b)
	}
}

// A tag nobody here has written a sentence for still reads as one — this is what moving to
// the library's translations bought. Before, `alphanum` fell through to "Code isn't valid."
func TestValidationMessageCoversTagsWeNeverWrote(t *testing.T) {
	type odd struct {
		Code string `json:"code" validate:"alphanum"`
	}
	msg := messageFor(t, odd{Code: "!!!"})

	if msg != "Code can only contain alphanumeric characters." {
		t.Fatalf("got %q", msg)
	}
}

// The guard that keeps the whole file honest. Translate returns fe.Error() verbatim for a
// tag with no translation — and fe.Error() is the struct dump this package exists to keep
// out of a response. Struct-level tags are ours to register, so it is a live risk every
// time someone adds one, not a theoretical branch.
func TestValidationMessageNeverLeaksAnUntranslatedTag(t *testing.T) {
	type custom struct {
		Days int `json:"days" validate:"required"`
	}
	v := NewValidator()
	v.RegisterStructValidation(func(sl validator.StructLevel) {
		sl.ReportError(sl.Current().Interface().(custom).Days, "Days", "Days", "notranslationforthis", "")
	}, custom{})

	msg := validationMessage(v.Struct(custom{Days: 1}))

	if strings.Contains(msg, "Key:") || strings.Contains(msg, "Error:Field validation") {
		t.Fatalf("leaked the struct dump: %s", msg)
	}
	if msg != "Days isn't valid." {
		t.Fatalf("got %q", msg)
	}
}

// The two struct-level tags this repo actually registers get real sentences, from the same
// limits the rules are built from.
func TestValidationMessageTranslatesOurStructTags(t *testing.T) {
	type capped struct {
		Sets int `json:"sets" validate:"required"`
	}
	v := NewValidator()
	v.RegisterStructValidation(func(sl validator.StructLevel) {
		sl.ReportError(sl.Current().Interface().(capped).Sets, "Sets", "Sets", "maxtotalsets", "")
	}, capped{})

	if got := validationMessage(v.Struct(capped{Sets: 1})); got != "A workout can't have more than 500 sets." {
		t.Fatalf("got %q", got)
	}
}

func validationBody(t *testing.T, err error) (int, map[string]any) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/x", nil)
	ValidationError(c, err)
	var body map[string]any
	if e := json.Unmarshal(w.Body.Bytes(), &body); e != nil {
		t.Fatal(e)
	}
	return w.Code, body
}

func TestValidationErrorBody(t *testing.T) {
	code, body := validationBody(t, NewValidator().Struct(signup{Email: "nope", Password: "abc"}))
	if code != 422 || body["code"] != "VALIDATION_FAILED" ||
		body["error"] != "Email must be a valid email address. Password must be at least 8 characters in length." {
		t.Fatalf("got %d %v", code, body)
	}
	want := []any{
		map[string]any{"code": "INVALID_EMAIL", "params": map[string]any{"field": "email"}},
		map[string]any{"code": "TOO_SHORT", "params": map[string]any{"field": "password", "min": float64(8)}},
	}
	if got := body["params"].(map[string]any)["violations"]; !reflect.DeepEqual(got, want) {
		t.Fatalf("violations = %#v", got)
	}

	type capped struct {
		Sets int `json:"sets" validate:"required"`
	}
	vl := NewValidator()
	vl.RegisterStructValidation(func(sl validator.StructLevel) {
		sl.ReportError(1, "Sets", "Sets", "maxtotalsets", "")
	}, capped{})
	_, body = validationBody(t, vl.Struct(capped{Sets: 1}))
	got := body["params"].(map[string]any)["violations"].([]any)[0]
	if !reflect.DeepEqual(got, map[string]any{"code": "TOO_MANY_WORKOUT_SETS", "params": map[string]any{"max": float64(500)}}) {
		t.Fatalf("struct-level violation = %#v", got)
	}

	type odd struct {
		Code string `json:"code" validate:"alphanum"`
	}
	_, body = validationBody(t, NewValidator().Struct(odd{Code: "!!!"}))
	got = body["params"].(map[string]any)["violations"].([]any)[0]
	if body["error"] != "Code can only contain alphanumeric characters." ||
		!reflect.DeepEqual(got, map[string]any{"code": "INVALID_FIELD", "params": map[string]any{"field": "code"}}) {
		t.Fatalf("unmapped tag = %v", body)
	}

	code, body = validationBody(t, errors.New("boom"))
	if code != 422 || body["code"] != "VALIDATION_FAILED" {
		t.Fatalf("got %d %v", code, body)
	}
	if _, has := body["params"]; has {
		t.Fatalf("params present: %v", body)
	}
}

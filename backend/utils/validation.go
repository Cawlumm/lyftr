package utils

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/Cawlumm/lyftr-backend/models"
	"github.com/go-playground/locales/en"
	ut "github.com/go-playground/universal-translator"
	"github.com/go-playground/validator/v10"
	entrans "github.com/go-playground/validator/v10/translations/en"
)

// One place that turns a rejected request into a sentence a person can act on.
//
// Before this, handlers passed the raw Go error straight to the client, and the client
// faithfully rendered it — apiErrorMessage prefers the server's message over anything it
// would write itself, which is correct and is exactly why this mattered. Someone who
// mistyped their email during sign-up was shown:
//
//	Key: 'RegisterRequest.Email' Error:Field validation for 'Email' failed on the 'email' tag
//
// That is a struct dump. It names a Go type the user has never heard of, says "tag", and
// does not say what to do. The client cannot rescue it: a message from the server is the
// most specific thing available, so the client is right to trust it. The fix has to be
// here, at the point where we know what the rule actually was.
//
// The mirror of packages/shared/src/utils/networkError.ts, which owns the half of this the
// server can never answer: a request that never arrived has no server-side story at all.

// The library ships the sentences. go-playground/validator carries an English translation
// for every one of its own tags, so a rule nobody here has thought about still comes out as
// a sentence — where the hand-written switch this replaced fell through to "X isn't valid."
// universal-translator and locales were already in go.sum as indirect dependencies of the
// validator itself, so this adds nothing to the module graph.
var translator = func() ut.Translator {
	locale := en.New()
	t, _ := ut.New(locale, locale).GetTranslator("en")
	return t
}()

// NewValidator returns the validator every handler shares, reporting fields by a readable
// name rather than their Go one. Without this the messages would say "CalorieTarget" — a
// name that appears nowhere in the API, the docs, or the app — and the library's own
// sentences would read "calorie_target must be 0 or greater", underscore and all.
// NewValidator returns that shared instance. It is built once: RegisterDefaultTranslations
// writes into the translator above, so a second call registers the same keys again and the
// library rejects them — "conflicting key 'required'". The doc comment already said every
// handler shares one validator; this makes the code say it too.
func NewValidator() *validator.Validate { return shared() }

var shared = sync.OnceValue(func() *validator.Validate {
	v := validator.New()
	v.RegisterTagNameFunc(func(f reflect.StructField) string {
		name := strings.SplitN(f.Tag.Get("json"), ",", 2)[0]
		if name == "" || name == "-" {
			return "" // the validator falls back to the Go field name
		}
		return label(name)
	})
	if err := entrans.RegisterDefaultTranslations(v, translator); err != nil {
		// Only reachable if the library's own translation table is malformed. Failing at
		// construction is right: the alternative is every rejected request answering with
		// the struct dump this file exists to prevent.
		panic("validator: registering English translations: " + err.Error())
	}

	return v
})

// label turns a JSON field name into something readable at the start of a sentence:
// "calorie_target" -> "Calorie target".
func label(field string) string {
	spaced := strings.ReplaceAll(field, "_", " ")
	return strings.ToUpper(spaced[:1]) + spaced[1:]
}

// unlabel is label's inverse for lowercase snake_case names: the raw JSON field name.
func unlabel(l string) string {
	return strings.ReplaceAll(strings.ToLower(l[:1])+l[1:], " ", "_")
}

// sentenceFor renders one failed rule, and guards the one way translations can regress on
// the switch they replaced: Translate returns fe.Error() verbatim for a tag with no
// translation registered, and fe.Error() is the struct dump. A future custom tag would leak
// it silently, so an untranslated tag is answered here the way the old default case did —
// true and useless, never a Go type name.
//
// The full stop is added here rather than baked into each template because validationMessage
// joins every failed rule with a space, and the library's English messages carry no
// terminal punctuation.
func sentenceFor(fe validator.FieldError) string {
	msg := fe.Translate(translator)
	if msg == "" || msg == fe.Error() {
		return fe.Field() + " isn't valid."
	}
	if last := msg[len(msg)-1]; last == '.' || last == '!' || last == '?' {
		return msg
	}
	return msg + "."
}

type violation struct {
	Code   string         `json:"code"`
	Params map[string]any `json:"params,omitempty"`
}

type rule struct {
	code   Code
	limit  string // "min" or "max": the param that carries the tag's limit
	noName bool   // struct-level: the sentence names no field
}

// kindClass says which meaning a tag has: min=8 on text is a length, gte=0 on a number a floor.
func kindClass(k reflect.Kind) string {
	switch k {
	case reflect.String:
		return "text"
	case reflect.Slice, reflect.Array, reflect.Map:
		return "list"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number"
	}
	return ""
}

// The one map from validator failure to code, keyed by tag and kind class. A tag not
// here becomes INVALID_FIELD and keeps the library's sentence.
var rules = map[string]rule{
	"required":     {code: codeRequired},
	"email:text":   {code: codeInvalidEmail},
	"min:text":     {code: codeTooShort, limit: "min"},
	"max:text":     {code: codeTooLong, limit: "max"},
	"max:list":     {code: codeTooManyItems, limit: "max"},
	"gte:number":   {code: codeBelowMinimum, limit: "min"},
	"gt:number":    {code: codeNotAboveMinimum, limit: "min"},
	"lte:number":   {code: codeAboveMaximum, limit: "max"},
	"oneof":        {code: codeNotAnOption},
	"maxtotalsets": {code: codeTooManyWorkoutSets, noName: true},
	"maxtotalrows": {code: codeTooManyProgramRows, noName: true},
}

func ruleFor(fe validator.FieldError) (rule, bool) {
	if r, ok := rules[fe.Tag()+":"+kindClass(fe.Kind())]; ok {
		return r, true
	}
	r, ok := rules[fe.Tag()]
	return r, ok
}

func violationOf(fe validator.FieldError) (violation, string) {
	r, ok := ruleFor(fe)
	if !ok {
		p := map[string]any{"field": unlabel(fe.Field())}
		return violation{Code: codeInvalidField.ID, Params: p}, sentenceFor(fe)
	}
	params := map[string]any{}
	if !r.noName {
		params["field"] = unlabel(fe.Field())
	}
	switch {
	case r.limit != "":
		params[r.limit] = json.Number(fe.Param())
	case fe.Tag() == "oneof":
		params["options"] = strings.ReplaceAll(fe.Param(), " ", ", ")
	case fe.Tag() == "maxtotalsets":
		params["max"] = models.MaxWorkoutSets
	case fe.Tag() == "maxtotalrows":
		params["max"] = models.MaxProgramRows
	}
	if len(params) == 0 {
		params = nil
	}
	return violation{Code: r.code.ID, Params: params}, r.code.Message(params)
}

// describe renders a validator failure as the joined English sentence plus its violations.
// Every failed rule is reported, not just the first: a sign-up form with a bad email AND a
// short password should say both, or the user fixes one and gets turned away again.
func describe(err error) (string, []violation) {
	var fieldErrs validator.ValidationErrors
	if !errors.As(err, &fieldErrs) || len(fieldErrs) == 0 {
		return CodeValidationFailed.Message(nil), nil
	}
	parts := make([]string, 0, len(fieldErrs))
	violations := make([]violation, 0, len(fieldErrs))
	for _, e := range fieldErrs {
		v, msg := violationOf(e)
		violations = append(violations, v)
		parts = append(parts, msg)
	}
	return strings.Join(parts, " "), violations
}

func validationMessage(err error) string {
	msg, _ := describe(err)
	return msg
}

// shapeName says what a field wanted in words a person can act on. typeErr.Type is a Go
// type, and printing it put "expected float64" in front of someone logging a meal — the
// same leak this file exists to stop, one size smaller and past a test that only checked
// for the name of the *error* type. Empty means we have no better word than "wrong type".
func shapeName(t reflect.Type) string {
	for t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	if t == reflect.TypeOf(time.Time{}) {
		return "a date"
	}
	switch t.Kind() {
	case reflect.Bool:
		return "true or false"
	case reflect.String:
		return "text"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "a number"
	case reflect.Slice, reflect.Array:
		return "a list"
	case reflect.Map, reflect.Struct:
		return "an object"
	}
	return ""
}

// BindMessage renders a request body we could not read at all. These are not user
// mistakes so much as client bugs or truncated uploads, but the person holding the phone
// still has to be told something — and "unexpected EOF" is not it.
func BindMessage(err error) string {
	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		if typeErr.Field != "" {
			if want := shapeName(typeErr.Type); want != "" {
				return fmt.Sprintf("%s must be %s.", label(typeErr.Field), want)
			}
			return fmt.Sprintf("%s has the wrong type.", label(typeErr.Field))
		}
		return "The request body had a field of the wrong type."
	}

	var syntaxErr *json.SyntaxError
	if errors.As(err, &syntaxErr) || errors.Is(err, io.ErrUnexpectedEOF) {
		return "The request body wasn't valid JSON."
	}

	if errors.Is(err, io.EOF) {
		return "The request body was empty."
	}

	// gin also surfaces validator failures through Bind when binding tags are used.
	var fieldErrs validator.ValidationErrors
	if errors.As(err, &fieldErrs) {
		return validationMessage(err)
	}

	return "The request couldn't be read."
}

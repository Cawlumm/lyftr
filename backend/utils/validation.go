package utils

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strings"
	"sync"

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

	// The default renders the options as a Go slice — "must be one of [breakfast lunch
	// dinner snack]", brackets and all.
	translate(v, "oneof", "{0} must be one of: {1}", func(fe validator.FieldError) []string {
		return []string{fe.Field(), strings.ReplaceAll(fe.Param(), " ", ", ")}
	})

	// Struct-level tags are ours, so their sentences have to be too. Without these,
	// Translate falls through to fe.Error() — see sentenceFor.
	translate(v, "maxtotalrows", fmt.Sprintf("A program can't have more than %d days, exercises and sets combined.", models.MaxProgramRows), nil)
	translate(v, "maxtotalsets", fmt.Sprintf("A workout can't have more than %d sets.", models.MaxWorkoutSets), nil)

	return v
})

// translate registers one override. args picks what fills {0}, {1}…; nil means the text
// stands alone.
func translate(v *validator.Validate, tag, text string, args func(validator.FieldError) []string) {
	_ = v.RegisterTranslation(tag, translator,
		func(t ut.Translator) error { return t.Add(tag, text, true) },
		func(t ut.Translator, fe validator.FieldError) string {
			var params []string
			if args != nil {
				params = args(fe)
			}
			out, err := t.T(tag, params...)
			if err != nil {
				return fe.Field() + " isn't valid."
			}
			return out
		})
}

// label turns a JSON field name into something readable at the start of a sentence:
// "calorie_target" -> "Calorie target".
func label(field string) string {
	spaced := strings.ReplaceAll(field, "_", " ")
	return strings.ToUpper(spaced[:1]) + spaced[1:]
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

// validationMessage renders a validator failure. Every failed rule is reported, not just
// the first: a sign-up form with a bad email AND a short password should say both, or the
// user fixes one and gets turned away again.
func validationMessage(err error) string {
	var fieldErrs validator.ValidationErrors
	if !errors.As(err, &fieldErrs) || len(fieldErrs) == 0 {
		return "Some of the details you entered aren't valid."
	}
	parts := make([]string, 0, len(fieldErrs))
	for _, e := range fieldErrs {
		parts = append(parts, sentenceFor(e))
	}
	return strings.Join(parts, " ")
}

// BindMessage renders a request body we could not read at all. These are not user
// mistakes so much as client bugs or truncated uploads, but the person holding the phone
// still has to be told something — and "unexpected EOF" is not it.
func BindMessage(err error) string {
	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		if typeErr.Field != "" {
			return fmt.Sprintf("%s has the wrong type — expected %s.", label(typeErr.Field), typeErr.Type)
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

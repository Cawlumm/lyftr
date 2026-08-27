package utils

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"
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

// NewValidator returns the validator every handler shares, reporting fields by their JSON
// name rather than their Go name. Without this the messages below would say "CalorieTarget"
// — a name that appears nowhere in the API, the docs, or the app.
func NewValidator() *validator.Validate {
	v := validator.New()
	v.RegisterTagNameFunc(func(f reflect.StructField) string {
		name := strings.SplitN(f.Tag.Get("json"), ",", 2)[0]
		if name == "-" {
			return ""
		}
		return name
	})
	return v
}

// label turns a JSON field name into something readable at the start of a sentence:
// "calorie_target" -> "Calorie target".
func label(field string) string {
	if field == "" {
		return "This field"
	}
	spaced := strings.ReplaceAll(field, "_", " ")
	return strings.ToUpper(spaced[:1]) + spaced[1:]
}

// fieldMessage renders one failed rule. Numbers and strings fail the same tags for
// different reasons — min on a string is a length, min on a number is a floor — so the
// kind is what decides the wording.
func fieldMessage(e validator.FieldError) string {
	name := label(e.Field())
	param := e.Param()
	isText := e.Kind() == reflect.String

	switch e.Tag() {
	case "required":
		return fmt.Sprintf("%s is required.", name)
	case "email":
		return fmt.Sprintf("%s must be a valid email address.", name)
	case "min":
		if isText {
			return fmt.Sprintf("%s must be at least %s characters.", name, param)
		}
		return fmt.Sprintf("%s must be at least %s.", name, param)
	case "max":
		if isText {
			return fmt.Sprintf("%s must be %s characters or fewer.", name, param)
		}
		return fmt.Sprintf("%s must be %s or less.", name, param)
	case "gte":
		if param == "0" {
			return fmt.Sprintf("%s can't be negative.", name)
		}
		return fmt.Sprintf("%s must be at least %s.", name, param)
	case "gt":
		if param == "0" {
			return fmt.Sprintf("%s must be greater than zero.", name)
		}
		return fmt.Sprintf("%s must be greater than %s.", name, param)
	case "lte":
		return fmt.Sprintf("%s must be %s or less.", name, param)
	case "lt":
		return fmt.Sprintf("%s must be less than %s.", name, param)
	case "oneof":
		return fmt.Sprintf("%s must be one of: %s.", name, strings.ReplaceAll(param, " ", ", "))
	default:
		// A tag nobody has written a sentence for yet. Say something true and useless
		// rather than something false, and never leak the struct dump.
		return fmt.Sprintf("%s isn't valid.", name)
	}
}

// ValidationMessage renders a validator failure. Every failed rule is reported, not just
// the first: a sign-up form with a bad email AND a short password should say both, or the
// user fixes one and gets turned away again.
func ValidationMessage(err error) string {
	var fieldErrs validator.ValidationErrors
	if !errors.As(err, &fieldErrs) || len(fieldErrs) == 0 {
		return "Some of the details you entered aren't valid."
	}
	parts := make([]string, 0, len(fieldErrs))
	for _, e := range fieldErrs {
		parts = append(parts, fieldMessage(e))
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
		return ValidationMessage(err)
	}

	return "The request couldn't be read."
}

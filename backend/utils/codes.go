package utils

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Clients key their own wording on Code.ID; the sentence stays for older clients and curl.
// The id, status and English template live here and nowhere else.
type Code struct {
	ID     string
	Status int
	text   string
}

var registry = map[string]Code{}

func define(id string, status int, text string) Code {
	if _, dup := registry[id]; dup {
		panic("utils: duplicate error code " + id)
	}
	c := Code{ID: id, Status: status, text: text}
	registry[id] = c
	return c
}

var placeholder = regexp.MustCompile(`\{\{(\w+)\}\}`)

// Message renders the code's English sentence.
func (c Code) Message(params map[string]any) string {
	return placeholder.ReplaceAllStringFunc(c.text, func(m string) string {
		name := placeholder.FindStringSubmatch(m)[1]
		v, ok := params[name]
		if !ok {
			return m
		}
		switch x := v.(type) {
		case string:
			if name == "field" {
				return label(x)
			}
			return x
		case json.Number:
			digits := uint64(0)
			if i := strings.Index(string(x), "."); i != -1 {
				digits = uint64(len(x) - i - 1)
			}
			f, _ := strconv.ParseFloat(string(x), 64)
			return translator.FmtNumber(f, digits)
		default:
			return fmt.Sprint(x)
		}
	})
}

var (
	CodeValidationFailed         = define("VALIDATION_FAILED", 422, "Some of the details you entered aren't valid.")
	CodeInvalidCredentials       = define("INVALID_CREDENTIALS", 401, "Invalid email or password.")
	CodeEmailTaken               = define("EMAIL_TAKEN", 409, "That email is already registered.")
	CodeRegistrationClosed       = define("REGISTRATION_CLOSED", 403, "Registration is closed on this server.")
	CodePasswordTooLong          = define("PASSWORD_TOO_LONG", 400, "Password must be 72 bytes or fewer — accented letters and emoji count for more than one.")
	CodePasswordUnchanged        = define("PASSWORD_UNCHANGED", 400, "Your new password must be different from your current one.")
	CodeWrongCurrentPassword     = define("WRONG_CURRENT_PASSWORD", 401, "Your current password is incorrect.")
	CodeAccountNotFound          = define("ACCOUNT_NOT_FOUND", 401, "That account no longer exists.")
	CodePasswordChangedElsewhere = define("PASSWORD_CHANGED_ELSEWHERE", 409, "Your password was changed elsewhere. Please try again.")
	CodePasswordChangedSignIn    = define("PASSWORD_CHANGED_SIGN_IN_AGAIN", 401, "Your password changed. Please sign in again.")
	CodeEmailChangedSignIn       = define("EMAIL_CHANGED_SIGN_IN_AGAIN", 401, "Your email changed. Please sign in again.")
	CodeSignInRequired           = define("SIGN_IN_REQUIRED", 401, "You need to sign in to do that.")
	CodeSessionInvalid           = define("SESSION_INVALID", 401, "Your session isn't valid. Please sign in again.")
	CodeSessionExpired           = define("SESSION_EXPIRED", 401, "Your session expired. Please sign in again.")
	CodeWrongTokenType           = define("WRONG_TOKEN_TYPE", 401, "That token can't be used here.")
	CodeInternalError            = define("INTERNAL_ERROR", 500, "Something went wrong on the server.")
	CodeDatabaseBusy             = define("DATABASE_BUSY", 503, "The database is busy. Try again in a moment.")
	CodeRateLimited              = define("RATE_LIMITED", 429, "Too many requests. Wait a moment and try again.")
	codeRequired                 = define("REQUIRED", 422, "{{field}} is a required field.")
	codeInvalidEmail             = define("INVALID_EMAIL", 422, "{{field}} must be a valid email address.")
	codeTooShort                 = define("TOO_SHORT", 422, "{{field}} must be at least {{min}} characters in length.")
	codeTooLong                  = define("TOO_LONG", 422, "{{field}} must be a maximum of {{max}} characters in length.")
	codeTooManyItems             = define("TOO_MANY_ITEMS", 422, "{{field}} must contain at maximum {{max}} items.")
	codeBelowMinimum             = define("BELOW_MINIMUM", 422, "{{field}} must be {{min}} or greater.")
	codeNotAboveMinimum          = define("NOT_ABOVE_MINIMUM", 422, "{{field}} must be greater than {{min}}.")
	codeAboveMaximum             = define("ABOVE_MAXIMUM", 422, "{{field}} must be {{max}} or less.")
	codeNotAnOption              = define("NOT_AN_OPTION", 422, "{{field}} must be one of: {{options}}.")
	codeTooManyWorkoutSets       = define("TOO_MANY_WORKOUT_SETS", 422, "A workout can't have more than {{max}} sets.")
	codeTooManyProgramRows       = define("TOO_MANY_PROGRAM_ROWS", 422, "A program can't have more than {{max}} days, exercises and sets combined.")
	codeInvalidField             = define("INVALID_FIELD", 422, "{{field}} isn't valid.")
	codeBadRequest               = define("BAD_REQUEST", 400, "")
	codeNotFound                 = define("NOT_FOUND", 404, "")
	codeServiceUnavailable       = define("SERVICE_UNAVAILABLE", 503, "")
)

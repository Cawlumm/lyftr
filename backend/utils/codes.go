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
	CodeInvalidID                = define("INVALID_ID", 400, "That id isn't valid.")
	CodeInvalidExerciseID        = define("INVALID_EXERCISE_ID", 400, "That exercise id isn't valid.")
	CodeInvalidProgramID         = define("INVALID_PROGRAM_ID", 400, "That program id isn't valid.")
	CodeInvalidWorkoutID         = define("INVALID_WORKOUT_ID", 400, "That workout id isn't valid.")
	CodeEntryNotFound            = define("ENTRY_NOT_FOUND", 404, "That entry no longer exists.")
	CodeSavedFoodNotFound        = define("SAVED_FOOD_NOT_FOUND", 404, "That saved food no longer exists.")
	CodeExerciseNotFound         = define("EXERCISE_NOT_FOUND", 404, "That exercise no longer exists.")
	CodeProgramNotFound          = define("PROGRAM_NOT_FOUND", 404, "That program no longer exists.")
	CodeWorkoutNotFound          = define("WORKOUT_NOT_FOUND", 404, "That workout no longer exists.")
	CodeUnknownExercises         = define("UNKNOWN_EXERCISES", 400, "One or more of those exercises no longer exist.")
	CodeInvalidDate              = define("INVALID_DATE", 400, "Date must be in YYYY-MM-DD format.")
	CodeInvalidLoggedOn          = define("INVALID_LOGGED_ON", 400, "Logged on must be in YYYY-MM-DD format.")
	CodeInvalidFromDate          = define("INVALID_FROM_DATE", 400, "From must be in YYYY-MM-DD format.")
	CodeInvalidToDate            = define("INVALID_TO_DATE", 400, "To must be in YYYY-MM-DD format.")
	CodeFoodNameTooLong          = define("FOOD_NAME_TOO_LONG", 400, "Name must be {{max}} characters or fewer.")
	CodeFoodBrandTooLong         = define("FOOD_BRAND_TOO_LONG", 400, "Brand must be {{max}} characters or fewer.")
	CodeServingSizeTooLong       = define("SERVING_SIZE_TOO_LONG", 400, "Serving size must be {{max}} characters or fewer.")
	CodeBarcodeTooLong           = define("BARCODE_TOO_LONG", 400, "Barcode must be {{max}} characters or fewer.")
	CodeImageURLTooLong          = define("IMAGE_URL_TOO_LONG", 400, "Image URL must be {{max}} characters or fewer.")
	CodeSearchTermRequired       = define("SEARCH_TERM_REQUIRED", 400, "A search term is required.")
	CodeInvalidBarcode           = define("INVALID_BARCODE", 400, "That barcode isn't valid.")
	CodeProductNotFound          = define("PRODUCT_NOT_FOUND", 404, "No product matched that barcode.")
	CodeFoodDatabaseTimeout      = define("FOOD_DATABASE_TIMEOUT", 503, "The food database didn't respond in time. Try again.")
	CodeFoodDatabaseUnreachable  = define("FOOD_DATABASE_UNREACHABLE", 503, "Couldn't reach the food database.")
	CodeFoodSearchUnavailable    = define("FOOD_SEARCH_UNAVAILABLE", 503, "Food search is temporarily unavailable.")
	CodeBarcodeLookupUnavailable = define("BARCODE_LOOKUP_UNAVAILABLE", 503, "Barcode lookup is temporarily unavailable.")
	CodeNoExerciseCatalog        = define("NO_EXERCISE_CATALOG", 400, "This server has no exercise catalog configured.")
	CodeCatalogUnreachable       = define("EXERCISE_CATALOG_UNREACHABLE", 503, "Couldn't reach the exercise catalog.")
	CodeExerciseSyncRunning      = define("EXERCISE_SYNC_RUNNING", 409, "An exercise sync is already running. Try again when it finishes.")
	CodeDisplayNameControlChars  = define("DISPLAY_NAME_CONTROL_CHARS", 400, "A name can't contain line breaks or other control characters.")
	CodeTimezoneEmpty            = define("TIMEZONE_EMPTY", 400, "Timezone can't be empty.")
	CodeUnknownTimezone          = define("UNKNOWN_TIMEZONE", 400, "Unknown timezone: {{timezone}}.")
	codeNotANumber               = define("NOT_A_NUMBER", 400, "{{field}} must be a number.")
	codeNotText                  = define("NOT_TEXT", 400, "{{field}} must be text.")
	codeNotTrueOrFalse           = define("NOT_TRUE_OR_FALSE", 400, "{{field}} must be true or false.")
	codeNotAList                 = define("NOT_A_LIST", 400, "{{field}} must be a list.")
	codeNotAnObject              = define("NOT_AN_OBJECT", 400, "{{field}} must be an object.")
	codeBodyWrongType            = define("BODY_WRONG_TYPE", 400, "The request body had a field of the wrong type.")
	codeBodyNotJSON              = define("BODY_NOT_JSON", 400, "The request body wasn't valid JSON.")
	codeBodyEmpty                = define("BODY_EMPTY", 400, "The request body was empty.")
	codeBodyUnreadable           = define("BODY_UNREADABLE", 400, "The request couldn't be read.")
	codeInvalidFields            = define("INVALID_FIELDS", 400, "Some of the details you entered aren't valid.")
)

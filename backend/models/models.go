package models

import "time"

type User struct {
	ID       int64  `json:"id" db:"id"`
	Email    string `json:"email" db:"email"`
	Password string `json:"-" db:"password_hash"`
	// TokenVersion is a server-side detail; like the hash it must never reach a client.
	TokenVersion int       `json:"-" db:"token_version"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

type UserSettings struct {
	UserID        int64  `json:"user_id" db:"user_id"`
	WeightUnit    string `json:"weight_unit" db:"weight_unit"` // "lbs" or "kg"
	CalorieTarget int    `json:"calorie_target" db:"calorie_target"`
	ProteinTarget int    `json:"protein_target" db:"protein_target"`
	CarbTarget    int    `json:"carb_target" db:"carb_target"`
	FatTarget     int    `json:"fat_target" db:"fat_target"`
	// IANA zone name (e.g. "America/New_York"). The server buckets day-scoped data
	// — food diary, daily macros, nutrition history — against this, so a client
	// asking for "2026-08-07" gets that user's local day rather than the UTC day.
	// "UTC" is the default and keeps the pre-existing behaviour for anyone who
	// never sets one.
	Timezone string `json:"timezone" db:"timezone"`
}

// DefaultUserSettings is the single source of truth for a brand-new user's
// settings — returned when no row exists yet and used as the base a partial
// update merges onto. Must stay in sync with the user_settings column defaults.
func DefaultUserSettings(uid int64) UserSettings {
	return UserSettings{
		UserID:        uid,
		WeightUnit:    "lbs",
		CalorieTarget: 2000,
		ProteinTarget: 150,
		CarbTarget:    250,
		FatTarget:     65,
		Timezone:      "UTC",
	}
}

type Exercise struct {
	ID               int64    `json:"id" db:"id"`
	Name             string   `json:"name" db:"name"`
	MuscleGroup      string   `json:"muscle_group" db:"muscle_group"`
	SecondaryMuscles []string `json:"secondary_muscles" db:"-"` // decoded from JSON column
	Category         string   `json:"category" db:"category"`   // "strength", "cardio", "flexibility"
	Equipment        string   `json:"equipment" db:"equipment"`
	Description      string   `json:"description" db:"description"`
	ImageURL         string   `json:"image_url,omitempty" db:"image_url"`
	VideoURL         string   `json:"video_url,omitempty" db:"video_url"`
}

type Workout struct {
	ID        int64             `json:"id" db:"id"`
	UserID    int64             `json:"user_id" db:"user_id"`
	Name      string            `json:"name" db:"name"`
	Notes     string            `json:"notes,omitempty" db:"notes"`
	Duration  int               `json:"duration" db:"duration"` // seconds
	StartedAt time.Time         `json:"started_at" db:"started_at"`
	// TZOffsetMinutes is the user's UTC offset when the workout started, e.g. -240
	// for New York in summer. StartedAt plus this offset gives the local day and the
	// local clock time, permanently — a workout is a real moment, so unlike the
	// diary it keeps the instant and records where it happened rather than flattening
	// to a date. Nil for rows older than the column whose zone could not be resolved.
	TZOffsetMinutes *int              `json:"tz_offset_minutes,omitempty" db:"tz_offset_minutes"`
	CreatedAt       time.Time         `json:"created_at" db:"created_at"`
	Exercises       []WorkoutExercise `json:"exercises,omitempty"`
	// Progression is set in-memory on the create response when finishing this
	// workout auto-progressed routine targets (issue #40). Never persisted.
	Progression *ProgressionResult `json:"progression,omitempty"`
}

// ProgressionResult summarizes staged auto-progression for the finish toast: which
// routine, how many per-set targets got a pending suggestion, and whether any was an
// all-time PR (drives the 🏆 toast). Transient (issue #40).
type ProgressionResult struct {
	ProgramID   int64  `json:"program_id"`
	ProgramName string `json:"program_name"`
	Count       int    `json:"count"`
	IsPR        bool   `json:"is_pr"`
}

// ResolveSuggestionsReq accepts or dismisses staged routine suggestions (#40) by
// program_set id. Accepted ids copy suggested_* → target_*; both clear the suggestion.
// max=500 bounds each list well above any plausible routine's set count — the store
// loops one UPDATE per id inside a single transaction, so an unbounded list could hold
// SQLite's writer lock for an extended period.
type ResolveSuggestionsReq struct {
	Accept  []int64 `json:"accept" validate:"max=500"`
	Dismiss []int64 `json:"dismiss" validate:"max=500"`
}

type WorkoutExercise struct {
	ID          int64    `json:"id" db:"id"`
	WorkoutID   int64    `json:"workout_id" db:"workout_id"`
	ExerciseID  int64    `json:"exercise_id" db:"exercise_id"`
	OrderIndex  int      `json:"order_index" db:"order_index"`
	Notes       string   `json:"notes,omitempty" db:"notes"`
	RestSeconds int      `json:"rest_seconds" db:"rest_seconds"`
	Exercise    Exercise `json:"exercise,omitempty"`
	Sets        []Set    `json:"sets,omitempty"`
}

type Set struct {
	ID                int64   `json:"id" db:"id"`
	WorkoutExerciseID int64   `json:"workout_exercise_id" db:"workout_exercise_id"`
	SetNumber         int     `json:"set_number" db:"set_number"`
	Reps              int     `json:"reps,omitempty" db:"reps"`
	Weight            float64 `json:"weight,omitempty" db:"weight"`     // raw value in user's preferred unit (lbs or kg)
	Duration          int     `json:"duration,omitempty" db:"duration"` // seconds, for timed sets
	Distance          float64 `json:"distance,omitempty" db:"distance"` // meters
	RPE               float64 `json:"rpe,omitempty" db:"rpe"`
	IsWarmup          bool    `json:"is_warmup" db:"is_warmup"`
}

type WeightLog struct {
	ID        int64     `json:"id" db:"id"`
	UserID    int64     `json:"user_id" db:"user_id"`
	Weight    float64   `json:"weight" db:"weight"` // raw value in user's preferred unit (lbs or kg)
	Notes     string    `json:"notes,omitempty" db:"notes"`
	LoggedAt  time.Time `json:"logged_at" db:"logged_at"`
	// LoggedOn is the calendar day this weigh-in belongs to (see FoodLog.LoggedOn).
	// It is also what "one entry per day" is enforced against.
	LoggedOn  string    `json:"logged_on" db:"logged_on"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type FoodLog struct {
	ID          int64     `json:"id" db:"id"`
	UserID      int64     `json:"user_id" db:"user_id"`
	Name        string    `json:"name" db:"name"`
	Meal        string    `json:"meal" db:"meal"` // "breakfast", "lunch", "dinner", "snacks"
	Calories    float64   `json:"calories" db:"calories"`
	Protein     float64   `json:"protein" db:"protein"`
	Carbs       float64   `json:"carbs" db:"carbs"`
	Fat         float64   `json:"fat" db:"fat"`
	Fiber       float64   `json:"fiber" db:"fiber"`
	Servings    float64   `json:"servings" db:"servings"`
	ServingSize string    `json:"serving_size" db:"serving_size"`
	Barcode     string    `json:"barcode,omitempty" db:"barcode"`
	ImageURL    string    `json:"image_url,omitempty" db:"image_url"`
	LoggedAt    time.Time `json:"logged_at" db:"logged_at"`
	// LoggedOn is the calendar day this entry belongs to, YYYY-MM-DD, in the user's
	// zone at the moment they logged it. It is the day the diary groups by — stored,
	// never re-derived, so it survives the user changing zones. LoggedAt remains the
	// instant, for time-of-day display and ordering within a day.
	LoggedOn  string    `json:"logged_on" db:"logged_on"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type SavedFood struct {
	ID          int64     `json:"id" db:"id"`
	UserID      int64     `json:"user_id,omitempty" db:"user_id"`
	Name        string    `json:"name" db:"name"`
	Brand       string    `json:"brand" db:"brand"`
	Calories    float64   `json:"calories" db:"calories"`
	Protein     float64   `json:"protein" db:"protein"`
	Carbs       float64   `json:"carbs" db:"carbs"`
	Fat         float64   `json:"fat" db:"fat"`
	Fiber       float64   `json:"fiber" db:"fiber"`
	ServingSize string    `json:"serving_size" db:"serving_size"`
	Barcode     string    `json:"barcode,omitempty" db:"barcode"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

type FoodSearchResult struct {
	Name        string  `json:"name"`
	Brand       string  `json:"brand,omitempty"`
	Calories    float64 `json:"calories"`
	Protein     float64 `json:"protein"`
	Carbs       float64 `json:"carbs"`
	Fat         float64 `json:"fat"`
	Fiber       float64 `json:"fiber"`
	ServingSize string  `json:"serving_size"`
	ImageURL    string  `json:"image_url,omitempty"`
	Source      string  `json:"source"` // "off" | "saved"
}

type FoodHistoryPoint struct {
	Date     string  `json:"date"`
	Calories float64 `json:"calories"`
	Protein  float64 `json:"protein"`
	Carbs    float64 `json:"carbs"`
	Fat      float64 `json:"fat"`
}

// Request/Response types

type RegisterRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type AuthResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refresh_token"`
	User         User   `json:"user"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

// ChangePasswordRequest re-authenticates the caller before the change. A valid access
// token is not enough on its own: it is exactly what an attacker holding a hijacked
// session already has, and letting that alone rewrite the password would turn session
// theft into permanent account takeover. min=8 mirrors RegisterRequest so the two
// cannot drift into a weaker password being settable than is registerable.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

// MaxWorkoutSets bounds the TOTAL number of sets across every exercise in a
// CreateWorkoutRequest (sum of len(Exercises[i].Sets), not each list's own max=500
// below independently) — enforced by the struct-level validation registered in
// controllers/workouts.go's init(). Exercises/Sets each also carry their own
// max=500 as a belt-and-suspenders per-list cap, but that alone doesn't bound their
// product (500 exercises x 500 sets = 250,000 rows), which is what actually matters
// since issue #40's CreateWorkoutWithProgression processes the whole request inside
// one transaction holding the process's single SQLite connection
// (db.DB.SetMaxOpenConns(1)) — see the total-sets check for why this constant, not
// the per-list tags, is the real bound on that transaction's worst-case duration.
const MaxWorkoutSets = 500

type CreateWorkoutRequest struct {
	Name      string    `json:"name" validate:"required"`
	Notes     string    `json:"notes"`
	Duration  int       `json:"duration"`
	StartedAt time.Time `json:"started_at"`
	// TZOffsetMinutes is the client's UTC offset when the workout started, e.g. -240.
	// Optional: nil from clients older than the stored-offset change, in which case
	// the server derives it from the account zone at StartedAt.
	TZOffsetMinutes *int `json:"tz_offset_minutes"`
	// ProgramID is set when the workout was started from a routine — it enables
	// per-set auto-progression of that routine's targets (issue #40). nil for
	// freestyle/quick workouts, which never progress a routine.
	ProgramID *int64 `json:"program_id"`
	// ProgramDayID is WHICH day of that routine's cycle the workout was started
	// under (the client's day picker knows) — drives the day-accurate due-day
	// tracker (ProgramStore.currentDayIndex). nil when not from a routine, or from
	// an older client that predates day tracking.
	ProgramDayID *int64 `json:"program_day_id"`
	// Exercises/Sets each cap at max=500 as an outer sanity bound, but that bounds
	// each dimension independently, not their product — see MaxWorkoutSets above for
	// the cap that actually matters.
	Exercises []CreateWorkoutExerciseReq `json:"exercises" validate:"max=500,dive"`
}

type CreateWorkoutExerciseReq struct {
	ExerciseID  int64          `json:"exercise_id" validate:"required"`
	OrderIndex  int            `json:"order_index"`
	Notes       string         `json:"notes"`
	RestSeconds int            `json:"rest_seconds"`
	Sets        []CreateSetReq `json:"sets" validate:"max=500"`
}

type CreateSetReq struct {
	SetNumber int     `json:"set_number"`
	Reps      int     `json:"reps"`
	Weight    float64 `json:"weight"`
	Duration  int     `json:"duration"`
	Distance  float64 `json:"distance"`
	RPE       float64 `json:"rpe"`
	IsWarmup  bool    `json:"is_warmup"`
	// ProgramSetID links this logged set back to the routine set it came from, so
	// auto-progression (issue #40) can bump exactly that target. nil for sets not
	// sourced from a routine (freestyle, or ad-hoc sets added mid-workout).
	ProgramSetID *int64 `json:"program_set_id"`
}

type LogWeightRequest struct {
	Weight   float64   `json:"weight" validate:"required,gt=0,lte=2000"`
	Notes    string    `json:"notes"`
	LoggedAt time.Time `json:"logged_at"`
	// LoggedOn is the calendar day this weigh-in belongs to, YYYY-MM-DD. Optional —
	// see LogFoodRequest.LoggedOn.
	LoggedOn string `json:"logged_on"`
}

type LogFoodRequest struct {
	Name        string    `json:"name" validate:"required"`
	Meal        string    `json:"meal" validate:"required,oneof=breakfast lunch dinner snacks"`
	Calories    float64   `json:"calories" validate:"gte=0"`
	Protein     float64   `json:"protein" validate:"gte=0"`
	Carbs       float64   `json:"carbs" validate:"gte=0"`
	Fat         float64   `json:"fat" validate:"gte=0"`
	Fiber       float64   `json:"fiber" validate:"gte=0"`
	Servings    float64   `json:"servings" validate:"gte=0"`
	ServingSize string    `json:"serving_size"`
	Barcode     string    `json:"barcode"`
	ImageURL    string    `json:"image_url"`
	LoggedAt    time.Time `json:"logged_at"`
	// LoggedOn is the calendar day the client files this under, YYYY-MM-DD. Optional:
	// omitted by clients older than the stored-day change, in which case the server
	// derives it from the account zone (see Handler.resolveDay).
	LoggedOn string `json:"logged_on"`
}

type SaveFoodRequest struct {
	Name        string  `json:"name" validate:"required"`
	Brand       string  `json:"brand"`
	Calories    float64 `json:"calories" validate:"gte=0"`
	Protein     float64 `json:"protein" validate:"gte=0"`
	Carbs       float64 `json:"carbs" validate:"gte=0"`
	Fat         float64 `json:"fat" validate:"gte=0"`
	Fiber       float64 `json:"fiber" validate:"gte=0"`
	ServingSize string  `json:"serving_size"`
	Barcode     string  `json:"barcode"`
}

// UpdateSettingsRequest is a PATCH: every field is a pointer so a nil (absent
// from the JSON) is distinguishable from an intentional 0. Only non-nil fields
// are applied — a partial update never zeroes the fields it omits (#37).
type UpdateSettingsRequest struct {
	WeightUnit    *string `json:"weight_unit" validate:"omitempty,oneof=lbs kg"`
	CalorieTarget *int    `json:"calorie_target" validate:"omitempty,gte=0"`
	ProteinTarget *int    `json:"protein_target" validate:"omitempty,gte=0"`
	CarbTarget    *int    `json:"carb_target" validate:"omitempty,gte=0"`
	FatTarget     *int    `json:"fat_target" validate:"omitempty,gte=0"`
	// Validated by loading it, not by a pattern: the only definition of a usable
	// zone is one the runtime can resolve (see controllers.ParseLocation).
	Timezone *string `json:"timezone"`
}

type Program struct {
	ID        int64        `json:"id"`
	UserID    int64        `json:"user_id,omitempty"`
	Name      string       `json:"name"`
	Notes     string       `json:"notes"`
	CreatedAt time.Time    `json:"created_at"`
	Days      []ProgramDay `json:"days"`
	// CurrentDayIndex is which entry of Days is due today — computed, never
	// persisted, from WHICH day the most recent program workout was logged against
	// (workouts.program_day_id): the next workout day after it in cycle order,
	// wrapping past rest days (rest days are never "due") — see
	// ProgramStore.currentDayIndex. Advancing only on an actual logged workout
	// means there's no calendar-week alignment (a 6-day cycle repeats every 6 days
	// regardless of which weekday it lands on). Always a workout day's index when
	// the program has any; 0 for a program with no days (or only rest days).
	CurrentDayIndex int `json:"current_day_index"`
}

// ProgramDay is one slot in a program's repeating cycle: either a workout day (its
// own ordered Exercises/Sets) or a rest day (Exercises always empty). Days repeat in
// OrderIndex order once the sequence is exhausted — see Program.CurrentDayIndex.
type ProgramDay struct {
	ID         int64             `json:"id,omitempty"`
	ProgramID  int64             `json:"program_id,omitempty"`
	OrderIndex int               `json:"order_index"`
	IsRestDay  bool              `json:"is_rest_day"`
	Name       string            `json:"name"`
	Exercises  []ProgramExercise `json:"exercises"`
}

type ProgramExercise struct {
	ID           int64        `json:"id,omitempty"`
	ProgramDayID int64        `json:"program_day_id,omitempty"`
	ExerciseID   int64        `json:"exercise_id"`
	OrderIndex   int          `json:"order_index,omitempty"`
	Notes        string       `json:"notes"`
	RestSeconds  int          `json:"rest_seconds"`
	Exercise     Exercise     `json:"exercise"`
	Sets         []ProgramSet `json:"sets"`
}

type ProgramSet struct {
	ID                int64   `json:"id,omitempty"`
	ProgramExerciseID int64   `json:"program_exercise_id,omitempty"`
	SetNumber         int     `json:"set_number"`
	TargetReps        int     `json:"target_reps"`
	TargetWeight      float64 `json:"target_weight"`
	// Pending auto-progression suggestion (#40) — nil when none. The user approves
	// it on the routine, which copies suggested_* into target_*. SuggestedIsPR marks
	// the set as also an all-time best (drives the 🏆 flair).
	SuggestedWeight *float64 `json:"suggested_weight,omitempty"`
	SuggestedReps   *int     `json:"suggested_reps,omitempty"`
	SuggestedIsPR   bool     `json:"suggested_is_pr,omitempty"`
}

// MaxProgramRows bounds the TOTAL number of rows (days + exercises + sets combined)
// a CreateProgramRequest can insert in one transaction — enforced by the
// struct-level validation registered in controllers/programs.go's init(). Days/
// Exercises/Sets each also carry their own max=500 per-list cap below as a
// belt-and-suspenders bound, but a program nests three levels (Days x Exercises x
// Sets), so those alone don't bound the product (500 x 500 x 500 rows) — see
// MaxWorkoutSets above for the two-level version of this same reasoning.
// insertProgramDays (program.go) issues one tx.Exec per row inside a single
// transaction holding the process's only SQLite connection (db.DB.SetMaxOpenConns(1)).
const MaxProgramRows = 2000

type CreateProgramRequest struct {
	Name  string                `json:"name" validate:"required"`
	Notes string                `json:"notes"`
	Days  []CreateProgramDayReq `json:"days" validate:"max=500,dive"`
	// DayIDsKnown marks a client that round-trips day ids (CreateProgramDayReq.ID)
	// on update. Update falls back to positional day matching for id-less requests
	// (clients predating the id round-trip), but request content alone can't
	// distinguish such a client from a modern one that deleted every existing day
	// and added only new ones — zero ids either way. Without this flag that edit
	// would positionally re-attribute the deleted days' workout history to the
	// brand-new days (see ProgramStore.Update). Ignored on create.
	DayIDsKnown bool `json:"day_ids_known"`
}

// CreateProgramDayReq is one Day in a program's cycle. Exercises is ignored (and
// should be empty) when IsRestDay is true.
type CreateProgramDayReq struct {
	// ID ties this request day back to an existing program_days row on update (0 =
	// new day). Position alone can't distinguish "renamed day 0" from "deleted day
	// 0", so without it any reorder or mid-list removal would silently re-attribute
	// the program's workout history (workouts.program_day_id) to the wrong days —
	// see ProgramStore.Update. Ignored on create.
	ID        int64                      `json:"id"`
	IsRestDay bool                       `json:"is_rest_day"`
	Name      string                     `json:"name"`
	Exercises []CreateProgramExerciseReq `json:"exercises" validate:"max=500,dive"`
}

type CreateProgramExerciseReq struct {
	ExerciseID  int64                 `json:"exercise_id" validate:"required"`
	Notes       string                `json:"notes"`
	RestSeconds int                   `json:"rest_seconds"`
	Sets        []CreateProgramSetReq `json:"sets" validate:"max=500"`
}

type CreateProgramSetReq struct {
	SetNumber    int     `json:"set_number"`
	TargetReps   int     `json:"target_reps"`
	TargetWeight float64 `json:"target_weight"`
}

type DailyStats struct {
	Date          string  `json:"date"`
	TotalCalories float64 `json:"total_calories"`
	TotalProtein  float64 `json:"total_protein"`
	TotalCarbs    float64 `json:"total_carbs"`
	TotalFat      float64 `json:"total_fat"`
	TotalFiber    float64 `json:"total_fiber"`
	WorkoutCount  int     `json:"workout_count"`
}

package models

import "time"

type User struct {
	ID        int64     `json:"id" db:"id"`
	Email     string    `json:"email" db:"email"`
	Password  string    `json:"-" db:"password_hash"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type UserSettings struct {
	UserID        int64  `json:"user_id" db:"user_id"`
	WeightUnit    string `json:"weight_unit" db:"weight_unit"` // "lbs" or "kg"
	CalorieTarget int    `json:"calorie_target" db:"calorie_target"`
	ProteinTarget int    `json:"protein_target" db:"protein_target"`
	CarbTarget    int    `json:"carb_target" db:"carb_target"`
	FatTarget     int    `json:"fat_target" db:"fat_target"`
}

type Exercise struct {
	ID               int64    `json:"id" db:"id"`
	Name             string   `json:"name" db:"name"`
	MuscleGroup      string   `json:"muscle_group" db:"muscle_group"`
	SecondaryMuscles []string `json:"secondary_muscles" db:"-"` // decoded from JSON column
	Category         string   `json:"category" db:"category"` // "strength", "cardio", "flexibility"
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
	CreatedAt time.Time         `json:"created_at" db:"created_at"`
	Exercises []WorkoutExercise `json:"exercises,omitempty"`
}

type WorkoutExercise struct {
	ID         int64    `json:"id" db:"id"`
	WorkoutID  int64    `json:"workout_id" db:"workout_id"`
	ExerciseID int64    `json:"exercise_id" db:"exercise_id"`
	OrderIndex int      `json:"order_index" db:"order_index"`
	Notes      string   `json:"notes,omitempty" db:"notes"`
	Exercise   Exercise `json:"exercise,omitempty"`
	Sets       []Set    `json:"sets,omitempty"`
}

type Set struct {
	ID                int64   `json:"id" db:"id"`
	WorkoutExerciseID int64   `json:"workout_exercise_id" db:"workout_exercise_id"`
	SetNumber         int     `json:"set_number" db:"set_number"`
	Reps              int     `json:"reps,omitempty" db:"reps"`
	Weight            float64 `json:"weight,omitempty" db:"weight"` // raw value in user's preferred unit (lbs or kg)
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
	Servings    float64   `json:"servings" db:"servings"`
	ServingSize string    `json:"serving_size" db:"serving_size"`
	Barcode     string    `json:"barcode,omitempty" db:"barcode"`
	LoggedAt    time.Time `json:"logged_at" db:"logged_at"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
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

type CreateWorkoutRequest struct {
	Name      string                    `json:"name" validate:"required"`
	Notes     string                    `json:"notes"`
	Duration  int                       `json:"duration"`
	StartedAt time.Time                 `json:"started_at"`
	Exercises []CreateWorkoutExerciseReq `json:"exercises"`
}

type CreateWorkoutExerciseReq struct {
	ExerciseID int64        `json:"exercise_id" validate:"required"`
	OrderIndex int          `json:"order_index"`
	Notes      string       `json:"notes"`
	Sets       []CreateSetReq `json:"sets"`
}

type CreateSetReq struct {
	SetNumber int     `json:"set_number"`
	Reps      int     `json:"reps"`
	Weight    float64 `json:"weight"`
	Duration  int     `json:"duration"`
	Distance  float64 `json:"distance"`
	RPE       float64 `json:"rpe"`
	IsWarmup  bool    `json:"is_warmup"`
}

type LogWeightRequest struct {
	Weight   float64   `json:"weight" validate:"required,gt=0,lte=2000"`
	Notes    string    `json:"notes"`
	LoggedAt time.Time `json:"logged_at"`
}

type LogFoodRequest struct {
	Name        string    `json:"name" validate:"required"`
	Meal        string    `json:"meal" validate:"required,oneof=breakfast lunch dinner snacks"`
	Calories    float64   `json:"calories" validate:"gte=0"`
	Protein     float64   `json:"protein" validate:"gte=0"`
	Carbs       float64   `json:"carbs" validate:"gte=0"`
	Fat         float64   `json:"fat" validate:"gte=0"`
	Servings    float64   `json:"servings" validate:"gt=0"`
	ServingSize string    `json:"serving_size"`
	Barcode     string    `json:"barcode"`
	LoggedAt    time.Time `json:"logged_at"`
}

type UpdateSettingsRequest struct {
	WeightUnit    string `json:"weight_unit" validate:"omitempty,oneof=lbs kg"`
	CalorieTarget int    `json:"calorie_target" validate:"omitempty,gte=0"`
	ProteinTarget int    `json:"protein_target" validate:"omitempty,gte=0"`
	CarbTarget    int    `json:"carb_target" validate:"omitempty,gte=0"`
	FatTarget     int    `json:"fat_target" validate:"omitempty,gte=0"`
}

type Program struct {
	ID        int64             `json:"id"`
	UserID    int64             `json:"user_id,omitempty"`
	Name      string            `json:"name"`
	Notes     string            `json:"notes"`
	CreatedAt time.Time         `json:"created_at"`
	Exercises []ProgramExercise `json:"exercises"`
}

type ProgramExercise struct {
	ID         int64        `json:"id,omitempty"`
	ProgramID  int64        `json:"program_id,omitempty"`
	ExerciseID int64        `json:"exercise_id"`
	OrderIndex int          `json:"order_index,omitempty"`
	Notes      string       `json:"notes"`
	Exercise   Exercise     `json:"exercise"`
	Sets       []ProgramSet `json:"sets"`
}

type ProgramSet struct {
	ID                int64   `json:"id,omitempty"`
	ProgramExerciseID int64   `json:"program_exercise_id,omitempty"`
	SetNumber         int     `json:"set_number"`
	TargetReps        int     `json:"target_reps"`
	TargetWeight      float64 `json:"target_weight"`
}

type CreateProgramRequest struct {
	Name      string                    `json:"name" validate:"required"`
	Notes     string                    `json:"notes"`
	Exercises []CreateProgramExerciseReq `json:"exercises"`
}

type CreateProgramExerciseReq struct {
	ExerciseID int64                `json:"exercise_id" validate:"required"`
	Notes      string               `json:"notes"`
	Sets       []CreateProgramSetReq `json:"sets"`
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
	WorkoutCount  int     `json:"workout_count"`
}

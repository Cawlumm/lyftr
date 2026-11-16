package stores

// The slugs a custom exercise may use: exactly what the app's form offers (CUSTOM_EXERCISE_* in
// packages/shared/src/utils/exerciseUtils.ts, read from customExerciseTaxonomy.json beside it,
// which taxonomy_test.go holds these to). They are the values open-exercise-db itself uses, minus
// equipment "none", which body-only already says. Rows written before these were narrowed may
// hold other slugs; nothing reads them through these lists, so they still load and display, and
// the edit form starts such a row from values it offers (CustomExerciseForm), so a save passes.
var (
	CustomMuscles = []string{
		"abdominals", "abductors", "adductors", "biceps", "calves", "chest", "forearms", "glutes",
		"hamstrings", "lats", "lower-back", "middle-back", "neck", "quadriceps", "shoulders", "traps", "triceps",
	}
	CustomEquipment = []string{
		"body-only", "barbell", "dumbbell", "machine", "cable", "kettlebells", "bands",
		"medicine-ball", "e-z-curl-bar", "exercise-ball", "foam-roll", "other",
	}
	CustomCategories = []string{
		"strength", "stretching", "plyometrics", "strongman", "powerlifting", "cardio", "olympic-weightlifting",
	}
)

func inList(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

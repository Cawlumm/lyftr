package stores

// The slugs a custom exercise may use. They are the same lists as MUSCLE_SLUGS,
// EQUIPMENT_SLUGS and CATEGORY_SLUGS in packages/shared/src/utils/exerciseUtils.ts, which is
// what the app can label; TestTaxonomy_MatchesOedbStubFixture holds them to what oedb serves.
var (
	MuscleGroups = []string{
		"abdominals", "abductors", "abs", "adductors", "back", "biceps", "calves", "chest", "core",
		"forearms", "full-body", "glutes", "hamstrings", "lats", "legs", "lower-back", "middle-back",
		"neck", "obliques", "other", "quadriceps", "shoulders", "traps", "triceps",
	}
	Equipment = []string{
		"body-only", "barbell", "dumbbell", "machine", "cable", "kettlebells", "bands",
		"medicine-ball", "e-z-curl-bar", "exercise-ball", "foam-roll", "none", "other",
	}
	Categories = []string{
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

import { offenders } from '../testing/sourceScan'

// #141 was reported as "the weight field won't take a decimal", and the first fix
// corrected NumberField — while ActiveExerciseCard and ExerciseFormCard carried their
// own copies of the same strip and stayed broken. ActiveExerciseCard is the List view,
// which is the *default*, so the reporter's own screen was still broken after the fix.
//
// Three copies is how that happened, so sanitizeNumericInput now lives in
// @lyftr/shared and this asserts nobody grows a fourth. It reads the sources rather
// than rendering anything: the bug was never in what a component does with the value,
// it was in one component not asking the shared helper in the first place.

// A character class that filters input down to digits — with or without a decimal
// point. This is the shape of the logic that must not be re-implemented.
const STRIP = /\[\^0-9\.?\]/

it('has exactly one implementation of numeric input sanitizing', () => {
  expect(offenders([STRIP])).toEqual([])
})

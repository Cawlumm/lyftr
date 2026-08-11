import type { FoodLog, FoodSearchResult, SavedFood } from '../types'

// A logged entry stores macros for the servings the user actually ate; a
// FoodSearchResult is always per single serving, because the detail view multiplies
// it back by whatever `servings` is chosen. So re-logging a past entry has to divide
// out its serving count first — miss that and every re-log silently multiplies.
//
// This is the highest-drift piece of math in the app: it lives on one screen per
// platform, and a change to one side would mis-log food on the other with nothing
// failing. Hence one copy.
export function entryToResult(e: FoodLog): FoodSearchResult {
  const s = e.servings || 1
  return {
    name: e.name,
    calories: e.calories / s,
    protein: e.protein / s,
    carbs: e.carbs / s,
    fat: e.fat / s,
    fiber: (e.fiber ?? 0) / s,
    serving_size: e.serving_size ?? '',
    image_url: e.image_url,
    source: 'saved',
  }
}

// A saved food is already stored per serving, so it maps across untouched.
export function savedToResult(s: SavedFood): FoodSearchResult {
  return {
    name: s.name, brand: s.brand,
    calories: s.calories, protein: s.protein, carbs: s.carbs,
    fat: s.fat, fiber: s.fiber, serving_size: s.serving_size, source: 'saved',
  }
}

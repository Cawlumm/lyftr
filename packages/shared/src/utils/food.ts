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

// The inverse of entryToResult: scale a per-serving result back up by the servings the
// user is logging. Sharing only the divide half would have left the two directions free
// to drift apart, which is the exact failure this pair exists to prevent — a re-logged
// entry would round-trip to different macros than it started with.
//
// toFixed(1) matches the 0.1 precision used everywhere else numbers are entered.
export function scaleServing(r: FoodSearchResult, servings: number) {
  return {
    name: r.name || 'Custom entry',
    calories: +(r.calories * servings).toFixed(1),
    protein: +(r.protein * servings).toFixed(1),
    carbs: +(r.carbs * servings).toFixed(1),
    fat: +(r.fat * servings).toFixed(1),
    fiber: +((r.fiber ?? 0) * servings).toFixed(1),
    servings,
    serving_size: r.serving_size ?? '',
    image_url: r.image_url ?? '',
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

// Which saved food, if any, is the same favourite as `item`.
//
// Starring stores the unscaled food and the servings stepper scales at log time, so
// "same food" is name + brand, and nothing else. Matched exactly, mirroring the
// UNIQUE(user_id, name, brand) index the server enforces: if the two disagreed, the
// client would offer a star the server then refuses to create as new.
//
// Brand is normalised to '' because that is what the API stores for a food with no
// brand, while a search result can carry undefined.
export function findSavedFood(
  saved: SavedFood[],
  item: Pick<FoodSearchResult, 'name' | 'brand'>,
): SavedFood | undefined {
  return saved.find(s => s.name === item.name && (s.brand ?? '') === (item.brand ?? ''))
}

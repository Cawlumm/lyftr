// Pure weight helpers — ported verbatim from web/src/stores/settings.ts. Backend
// always stores lbs; use these everywhere weight values are read/written/shown.

export const weightLabel = (unit: string) => (unit === 'kg' ? 'kg' : 'lbs')
export const weightShort = (unit: string) => (unit === 'kg' ? 'kg' : 'lb')

export const lbsToDisplay = (lbs: number, unit: string): number =>
  unit === 'kg' ? lbs / 2.20462 : lbs

export const displayToLbs = (val: number, unit: string): number =>
  unit === 'kg' ? val * 2.20462 : val

// Round to 0.1 — enough precision to log exact weights without floating-point noise
// from the kg conversion.
export const round1 = (n: number): number => Math.round(n * 10) / 10

// Weight in the user's unit, rounded to 0.1 — use wherever a weight is shown or
// pre-filled into an input.
export const displayWeight = (lbs: number, unit: string): number => round1(lbsToDisplay(lbs, unit))

// Volume/aggregate (sum of reps×weight) in the user's unit, as a whole number.
export const displayVolume = (lbs: number, unit: string): number => Math.round(lbsToDisplay(lbs, unit))

// Bodyweight bounds — mirror the backend (LogWeightRequest: gt=0, lte=2000 lbs) so
// the user gets instant feedback instead of a round-trip 400.
export const MAX_WEIGHT_LBS = 2000

// The max in the user's display unit (2000 lb ≈ 907 kg).
export const maxWeight = (unit: string): number => round1(lbsToDisplay(MAX_WEIGHT_LBS, unit))

// `value` is in the user's display unit. Returns an error message, or null if valid.
export const weightError = (value: number, unit: string): string | null => {
  if (!Number.isFinite(value) || value <= 0) return 'Enter a valid weight'
  if (displayToLbs(value, unit) > MAX_WEIGHT_LBS) {
    return `Weight must be under ${Math.round(maxWeight(unit))} ${weightShort(unit)}`
  }
  return null
}

export const isValidWeight = (value: number, unit: string): boolean =>
  weightError(value, unit) === null

// Resolve the lbs value to store when saving an edited weight. Weights are shown
// rounded to 0.1 in the display unit, so re-converting the shown value back to lbs
// drifts; if the shown value is unchanged from the original's rounded display, keep
// the original lbs exactly, and only convert when the user actually changed it.
export const resolveWeightLbs = (displayValue: string, originalLbs: number, unit: string): number => {
  const shown = parseFloat(displayValue)
  if (Number.isFinite(shown) && shown === displayWeight(originalLbs, unit)) return originalLbs
  return displayToLbs(shown, unit)
}

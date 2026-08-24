// Increments for the +/- stepper buttons, in *display* units — the caller has
// already converted lbs↔kg, so 2.5 means "2.5 of whatever the user is reading".
// They only drive the buttons: every field still accepts any typed value at 0.1
// precision (#39), so a step is a convenience, never a limit.
//
// Three constants rather than one, because each answers a different question about
// the thing being measured:

// How much a body moves between weigh-ins — tenths. The old 0.5 was too coarse to
// express a normal day's change (#80). Used by every bodyweight input: it's
// WeightInput's default step (web) and passed explicitly on the three mobile
// weight screens.
export const BODYWEIGHT_STEP = 0.1

// How much a barbell can actually be loaded by — the smallest pair of plates on
// the rack, and the same number in either unit (2.5 lb / 2.5 kg). Used by gym
// mode's weight tile on both platforms. Deliberately NOT the bodyweight step:
// nudging a squat by a tenth of a pound is not a thing you can do.
export const PLATE_STEP = 2.5

// Reps are whole. Used by gym mode's reps tile on both platforms.
export const REP_STEP = 1

// Step a numeric value by `delta`, round to the app's 0.1 precision, and clamp to
// [min, max]. Single source for the +/- stepper math shared by WeightInput and the
// gym StepperTile (default min 0 also serves as the "no negatives" guard).
//
// The toFixed(1) is what keeps repeated steps exact (183.6 + 0.1 is 183.7, not
// 183.70000000000002) — and it's also the floor on how fine a step can be: 0.1 is
// the smallest one this can express, which is why BODYWEIGHT_STEP stops there.
export function clampStep(base: number, delta: number, opts: { min?: number; max?: number } = {}): number {
  const { min = 0, max = Infinity } = opts
  const b = Number.isFinite(base) ? base : 0
  return Math.min(max, Math.max(min, +(b + delta).toFixed(1)))
}

// Clamp a freely-typed numeric string to a lower bound (validation for inputs that
// commit on every keystroke). Returns a finite number ≥ min.
export function clampValue(raw: string | number, min = 0): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? Math.max(min, n) : min
}

// Strip anything that isn't part of a non-negative number, for RN inputs. Web
// needs none of this — <input type="number"> lets the browser parse the locale's
// own separator — but a React Native TextInput hands back raw text with no such
// hook, so every mobile numeric field sanitizes what it receives.
//
// The comma is load-bearing (#141). Android's decimal-pad shows the *locale's*
// separator, which across most of Europe is a comma, and on those keypads there is
// no full stop to type instead. Stripping it as "not a digit" deleted the only
// separator those users could reach, so a weight of 12,5 could not be entered at
// all. Fold it to a point; the stored value stays machine-readable either way.
// 'numeric' still drops it, so reps can't be typed fractional by the back door.
//
// One copy on purpose. This logic was duplicated across three components when #141
// was filed, and the first fix corrected one of them while the default workout view
// stayed broken — which is the failure mode a shared util exists to prevent.
export function sanitizeNumericInput(raw: string, mode: 'numeric' | 'decimal'): string {
  const v = raw.replace(/,/g, '.').replace(mode === 'decimal' ? /[^0-9.]/g : /[^0-9]/g, '')
  if (mode !== 'decimal') return v
  const i = v.indexOf('.')
  return i === -1 ? v : v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
}

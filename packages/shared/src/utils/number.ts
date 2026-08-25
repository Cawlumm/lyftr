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

// Typed text -> the canonical form the app stores. Every numeric field on mobile calls
// this; web needs none of it, because <input type="number"> lets the browser parse the
// locale's own separator. React Native has no equivalent hook: ReactEditText replaces
// Android's KeyListener specifically to "permit all keyboard input through", so
// `keyboardType` constrains what is *drawn* and never what arrives.
//
// The separator is the whole bug (#141). Android's decimal-pad draws the *locale's*
// decimal character - a comma across most of Europe, and on those keypads often with no
// full stop at all - so stripping it as "not a digit" left those users unable to enter a
// decimal weight by any route.
//
// The rule is wger's, who fixed the same report against their Flutter app
// (wger-project/flutter#1147, lib/core/number_input.dart):
//
//     digits, plus ONE separator. A "." and a "," both count, whatever the locale,
//     because "a numeric keyboard cannot be pinned to a locale" - the keypad may emit
//     either. Everything else is dropped.
//
// Which separator wins, where we go one step further than they do:
//   - one KIND present -> the FIRST. "12,5," is 12.5 and "12.5." is 12.5.
//   - both kinds -> the LAST, because then it is unambiguous: "1.234,5" and "1,234.5"
//     are both 1234.5 without having to know which locale produced them. wger keeps the
//     first unconditionally, which reads a pasted "1.234,5" as 1.23.
//
// First-when-unambiguous is not a detail. A TextInput re-sends the WHOLE field on every
// keystroke and the cursor can sit mid-string, so preferring the last separator turns one
// keypress inside a prefilled "82,5" into "825" - a silent 10x that backspace cannot undo,
// because the fraction digit has become an integer digit.
//
// Grouping is deliberately not detected. It cannot be, mid-type: "1," arrives with
// nothing after it, so any rule that reads grouping works on paste and lies while typing,
// which is the path people actually use. wger does not attempt it either. "1,200" is 1.2
// in every locale and by both routes.
//
// 'numeric' keeps digits only, so a separator cannot sneak a fractional rep in sideways.
export function sanitizeNumericInput(raw: string, mode: 'numeric' | 'decimal'): string {
  if (mode !== 'decimal') return raw.replace(/[^0-9]/g, '')

  // Whitespace never counts as a separator. fr, ru, sv, pl, cs, fi, nb and uk group with
  // a space, so a trailing space or a pasted "12,50 kg" would otherwise read as 1250.
  const bare = raw.replace(/\s/g, '')

  const at: number[] = []
  for (let i = 0; i < bare.length; i++) if (bare[i] === '.' || bare[i] === ',') at.push(i)
  const kinds = new Set(at.map((i) => bare[i]))
  const decimalAt = at.length === 0 ? -1 : kinds.size > 1 ? at[at.length - 1] : at[0]

  let out = ''
  for (let i = 0; i < bare.length; i++) {
    const ch = bare[i]
    if (ch >= '0' && ch <= '9') out += ch
    else if (i === decimalAt) out += '.'
  }
  return out
}

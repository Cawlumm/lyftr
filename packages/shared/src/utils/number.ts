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

// Locale facts for reading a typed number. Injected, not detected: Hermes leaves
// Intl.NumberFormat#formatToParts unimplemented on iOS - PlatformIntlApple.mm is a
// literal llvm_unreachable - so the obvious detection route crashes on half our
// devices. Mobile passes expo-localization's native values, the same reason
// detectTimezone is injected into the settings store. Defaults are en-US, so a caller
// that never configures anything behaves exactly as before.
let separators = { decimal: '.', group: ',' }

export function configureNumberLocale(next: { decimal?: string | null; group?: string | null }): void {
  separators = { decimal: next.decimal || '.', group: next.group || ',' }
}

// Arabic-Indic (U+0660-0669) and Extended Arabic-Indic (U+06F0-06F9) digits, which an
// Arabic or Persian keypad emits instead of ASCII. Deleting them as "not a digit" turns
// a logged weight into 0 silently. Arithmetic rather than Intl, so this works on iOS;
// String.normalize('NFKC') is no help here - it folds fullwidth digits but leaves these
// alone, so a test written with fullwidth characters would pass while the real case fails.
const NON_ASCII_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g
const foldDigits = (s: string): string =>
  s.replace(NON_ASCII_DIGITS, (d) => {
    const c = d.charCodeAt(0)
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660)
  })

// Strip anything that isn't part of a non-negative number, for RN inputs. Web needs none
// of this - <input type="number"> lets the browser parse the locale's own separator - but
// a React Native TextInput hands back raw text with no such hook, so every mobile numeric
// field sanitizes what it receives. RN makes that mandatory rather than defensive: it
// replaces Android's KeyListener specifically to "permit all keyboard input through", so
// keyboardType constrains what is *drawn*, never what arrives.
//
// The separator is load-bearing (#141). Android's decimal-pad shows the *locale's*
// separator - a comma across most of Europe - and on those keypads there is often no full
// stop at all, so stripping it as "not a digit" left those users unable to enter 12,5.
//
// Which character means what depends on the locale, and guessing costs real accuracy:
// read as en-US, "1,200" is twelve hundred; read as de-DE it is 1.2. So the rules are:
//
//   - one separator, and it is the locale's group character followed by exactly three
//     digits -> grouping, dropped. "1,200" in en-US is 1200.
//   - one separator otherwise -> decimal, however it is spelled. "12,5" and "12." both
//     work whatever the locale, because a keypad emits an ASCII comma even where the
//     locale's own decimal character is something else (Arabic locales do this).
//   - several separators -> the last is the decimal, the rest are grouping. Handles
//     "1.234,5" and "1,234.5" identically without needing to know which locale is which.
//
// 'numeric' keeps digits only, so a separator can't sneak a fractional rep in sideways.
export function sanitizeNumericInput(raw: string, mode: 'numeric' | 'decimal'): string {
  const folded = foldDigits(raw)
  if (mode !== 'decimal') return folded.replace(/[^0-9]/g, '')

  const { decimal, group } = separators
  const isSep = (ch: string) => ch === decimal || ch === group || ch === '.' || ch === ','
  const at: number[] = []
  for (let i = 0; i < folded.length; i++) if (isSep(folded[i])) at.push(i)

  let decimalAt = -1
  if (at.length === 1) {
    const i = at[0]
    const trailingDigits = folded.slice(i + 1).replace(/[^0-9]/g, '').length
    const grouping = folded[i] === group && folded[i] !== decimal && trailingDigits === 3
    decimalAt = grouping ? -1 : i
  } else if (at.length > 1) {
    decimalAt = at[at.length - 1]
  }

  let out = ''
  for (let i = 0; i < folded.length; i++) {
    const ch = folded[i]
    if (ch >= '0' && ch <= '9') out += ch
    else if (i === decimalAt) out += '.'
  }
  return out
}

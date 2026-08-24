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

// Typed text -> the canonical form the app stores. Every numeric TextInput on mobile goes
// through this; there is no second copy. Web needs none of it - <input type="number"> lets
// the browser parse the locale's own separator - but React Native hands back raw text with
// no hook to filter keys. That is mandatory rather than defensive: ReactEditText replaces
// Android's KeyListener specifically to "permit all keyboard input through", so
// keyboardType constrains what is *drawn*, never what arrives.
//
// The separator is load-bearing (#141). Android's decimal-pad shows the *locale's*
// separator - a comma across most of Europe - and on those keypads there is often no full
// stop at all, so stripping it as "not a digit" left those users unable to enter 12,5.
//
// The rule, which is wger's rule for the same problem in their own decimal widget:
//
//     digits, plus ONE separator. A "." or a "," both count, whatever the locale, because
//     a keypad emits an ASCII comma even where the locale's decimal character is something
//     else (Adobe's parser hardcodes exactly this for Arabic). Everything else is dropped.
//
// Which separator wins:
//   - only one KIND present -> the FIRST one. "12,5," is 12.5, and "12.5." is 12.5.
//   - both kinds present -> the LAST one, because then it is unambiguous: "1.234,5" and
//     "1,234.5" are both 1234.5 without needing to know which locale produced them.
//
// First-when-unambiguous is not a detail. A TextInput re-sends the WHOLE field on every
// keystroke and the cursor can sit mid-string (these cells have no selectTextOnFocus, so
// tapping a prefilled "82,5" lands inside it). Preferring the last separator turned one
// inserted keystroke into "825." - a silent 10x, committed on that key, that backspace
// could not undo because the fraction digit had become an integer digit.
//
// Note what is deliberately NOT here: grouping detection. A thousands separator cannot be
// recognised while it is being typed - "1," arrives with nothing after it - so any rule
// that reads grouping works on paste and lies on the typed path, which is the path people
// use. wger does not attempt it either. "1,200" is therefore 1.2 in every locale and by
// both routes; consistent and predictable beats occasionally-cleverer.
//
// 'numeric' keeps digits only, so a separator can't sneak a fractional rep in sideways.
export function sanitizeNumericInput(raw: string, mode: 'numeric' | 'decimal'): string {
  const folded = foldDigits(raw)
  if (mode !== 'decimal') return folded.replace(/[^0-9]/g, '')

  // Whitespace never counts. fr, ru, sv, pl, cs, fi, nb and uk use a space as their group
  // character and expo-localization passes it through verbatim, so a trailing space or a
  // pasted "12,50 kg" would otherwise be read as a separator.
  const bare = folded.replace(/\s/g, '')
  const isSep = (ch: string) => ch === '.' || ch === ',' || ch === separators.decimal

  const at: number[] = []
  for (let i = 0; i < bare.length; i++) if (isSep(bare[i])) at.push(i)
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

// The other half of the round trip. sanitizeNumericInput returns what the *field*
// shows, in the locale's own notation; these two convert between that and the number
// the app stores, which is always canonical.
//
// Without both halves the trip is asymmetric: a German user types "12,5", it is stored
// as 12.5, and the field redraws as "12.5" - the app quietly rewriting what they typed.
// wger states the principle well: display and parsing go through the same format, so a
// value can never be mis-read because of a separator mismatch between locales.

/** Canonical field text -> what to draw, in the locale's notation. Text-level on
 * purpose: it has to survive a half-typed "12.", which Number() would round to 12 and
 * so delete the separator the user just pressed. */
export function toLocaleText(canonical: string): string {
  // Guard the type rather than trusting it: the en-US fast path returned a non-string
  // unchanged while every comma locale threw on .split, so a mistyped caller would have
  // crashed for exactly the users this change exists for — and passed in the tests.
  if (typeof canonical !== 'string') return ''
  return separators.decimal === '.' ? canonical : canonical.split('.').join(separators.decimal)
}

// The third and last piece: a number the app holds -> the text a person reads.
//
// sanitizeNumericInput and toLocaleText cover a numeric *field*, where the value is
// already a string being edited. Everything else on screen — a weight card, a macro
// chip, a chart tick, a "last: 83.4" caption — starts from a number, and until this
// existed each of those did its own `String(n)` or `n.toFixed(1)` and rendered a full
// stop regardless of locale. One row could show both notations at once.
//
// Deliberately NOT Intl.NumberFormat, even though format() (unlike formatToParts) is
// implemented on iOS. Using it here would mean display followed the OS locale while
// input followed the separators injected in configureNumberLocale — two sources for the
// same question, and the first place they disagreed would be a bug nobody could
// reproduce. One source, same as the day-attribution rule.
//
// Grouping is opt-in. A bodyweight of 1 234,5 reads worse than 1234,5, but a yearly
// volume total wants it, so the caller decides rather than the util guessing.
export function formatNumber(
  value: number | string | null | undefined,
  opts: { decimals?: number; grouped?: boolean } = {},
): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return ''

  const fixed = opts.decimals === undefined ? String(n) : n.toFixed(opts.decimals)
  const neg = fixed.startsWith('-')
  const [intPart, fracPart] = (neg ? fixed.slice(1) : fixed).split('.')

  const grouped =
    opts.grouped && intPart.length > 3
      ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separators.group)
      : intPart

  return (neg ? '-' : '') + grouped + (fracPart ? separators.decimal + fracPart : '')
}

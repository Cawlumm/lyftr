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

// Locale, injected once at startup. One input, one derived value, and they cannot
// disagree - which is the point.
//
// `locale` is what Intl formats with, and formatNumber is the only thing that draws a
// number. The decimal character used for PARSING is then read back out of that same
// formatter rather than accepted from the caller, because the two arriving separately is
// a real hazard: on iOS the Number Format setting is independent of the language, so
// expo-localization can report a German separator while the language tag says en-US. The
// field would draw "102,5" and the caption beside it "102.5" - exactly the split this
// change exists to remove.
//
// JavaScript has no number parser (Intl.NumberFormat exposes format and formatToParts and
// nothing that reads a string back), so sanitizeNumericInput is ours to write and needs
// that character. wger does not have this problem: Dart's intl ships NumberFormat.tryParse,
// so their widget formats and parses from one object.
//
// `decimal` remains accepted as a fallback for a runtime where Intl is unavailable, and
// `group` is accepted and ignored - grouping is Intl's business now, and the parser
// deliberately does not detect it (see sanitizeNumericInput).
let separators = { decimal: '.' }
let localeTag: string | undefined

export function configureNumberLocale(next: {
  decimal?: string | null
  group?: string | null
  locale?: string | null
}): void {
  // An invalid tag makes `new Intl.NumberFormat(tag)` throw RangeError - and it would
  // throw at render, on every one of the ~24 call sites, long after the bad value was
  // accepted here. Probe once and degrade to the runtime default instead.
  let tag: string | undefined = next.locale || undefined
  if (tag) {
    try {
      new Intl.NumberFormat(tag).format(1)
    } catch {
      tag = undefined
    }
  }
  localeTag = tag
  formatters.clear()

  // Whatever Intl draws a decimal point as, that is what the parser accepts. \p{Nd} and
  // not [0-9]: ar-EG formats 1.1 as "١٫١", so stripping only ASCII digits would leave the
  // whole string and hand the parser three characters instead of one separator.
  const drawn = formatNumber(1.1).replace(/\p{Nd}/gu, '')
  separators = { decimal: drawn || next.decimal || '.' }
}

// Constructing an Intl.NumberFormat is expensive enough to matter in a list that
// re-renders per keystroke, and they are immutable, so keep them. Cleared above whenever
// the locale changes, so the cache cannot outlive the setting it was built from.
const formatters = new Map<string, Intl.NumberFormat>()
function formatterFor(grouped: boolean, decimals?: number): Intl.NumberFormat {
  const key = `${localeTag ?? ''}|${grouped}|${decimals ?? ''}`
  let f = formatters.get(key)
  if (!f) {
    const opts: Intl.NumberFormatOptions = { useGrouping: grouped }
    if (decimals !== undefined) {
      opts.minimumFractionDigits = decimals
      opts.maximumFractionDigits = decimals
    }
    f = new Intl.NumberFormat(localeTag, opts)
    formatters.set(key, f)
  }
  return f
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

// The third and last piece: a number the app holds -> the text a person reads. Cards,
// chips, captions, chart ticks.
//
// This is a thin wrapper over Intl.NumberFormat rather than a hand-rolled formatter,
// because the hand-rolled one was a worse copy of a built-in. It produced byte-identical
// output to Intl for en-US, de-DE and fr-FR - and got en-IN wrong, rendering 12,345,678.9
// where the lakh/crore system wants 1,23,45,678.9. Grouping is not "every three digits";
// it is CLDR data, and Intl already carries it.
//
// Kept as a named function rather than calling Intl at each site so there is still one
// place that decides how a number looks, which is what numberDisplay.guard.test.ts
// enforces - and one place to change if Intl ever proves unreliable under Hermes.
//
// Grouping is opt-in: "1 234,5" reads worse than "1234,5" for a bodyweight, while a
// volume total wants it. The caller knows which it has.
export function formatNumber(
  value: number | string | null | undefined,
  opts: { decimals?: number; grouped?: boolean } = {},
): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return ''
  return formatterFor(Boolean(opts.grouped), opts.decimals).format(n)
}

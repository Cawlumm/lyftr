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
//     digits, plus ONE separator - the FIRST one. A "." and a "," both count, whatever
//     the locale, because "a numeric keyboard cannot be pinned to a locale": the keypad
//     may emit either. Everything else is dropped.
//
// First rather than last is load-bearing, not a tie-break. A TextInput re-sends the WHOLE
// field on every keystroke and the cursor can sit mid-string, so preferring the last would
// turn one keypress inside a prefilled "82,5" into "825" - a silent 10x that backspace
// cannot undo, because the fraction digit has become an integer digit.
//
// What this deliberately does NOT do is work out which character was meant as grouping.
// Doing that properly needs the locale's own decimal character, and then the other one is
// grouping by definition - which is what ICU-based parsers (react-aria's NumberParser,
// Expensify's LocaleDigitUtils) do. No locale is injected here, so guessing would be a
// heuristic no other app ships. The cost is that a *pasted* "1.234,5" reads 1.2345; typing
// is unaffected, and wger accepts the same trade. If the locale ever is injected, replace
// this with the ICU rule rather than a smarter guess.
//
// It also cannot be done mid-type in any case: "1," arrives with nothing after it, so a
// grouping-aware rule works on paste and lies while typing, which is the path people use.
// "1,200" is therefore 1.2 in every locale and by both routes.
//
// Why this is hand-written rather than a dependency, so nobody has to re-derive it:
// JavaScript has a number FORMATTER and no number PARSER. Intl.NumberFormat.prototype
// exposes format, formatToParts, formatRange, formatRangeToParts and resolvedOptions -
// nothing that reads a string back. (wger's version is shorter because Dart's intl ships
// NumberFormat.tryParse, so their widget formats and parses from one object.)
//
// The one maintained library that does this properly is react-aria's
// @internationalized/number, and its NumberParser calls formatToParts in four places -
// which Hermes does not implement on iOS (facebook/hermes#1188, open). Adopting it means
// also shipping @formatjs/intl-numberformat and CLDR locale data as a polyfill, to replace
// the ~20 lines below. The two React Native-specific packages are stale (2022 and 2023) and
// one depends on the deprecated `intl` polyfill. Web needs none of this at all:
// <input type="number"> lets the browser parse the locale's separator.
//
// REVISIT if @formatjs/intl-numberformat ever lands here for another reason. At that point
// react-aria's parser works on both platforms and this function should be deleted for it.
//
// Localised digits, folded the way Dart's intl does it - the library wger's own
// NumberFormat.parse runs on, so this is the reference implementation rather than our
// invention:
//
//     number_parser_base.dart:118   var digitValue = charCode - _localeZero;
//     number_parser_base.dart:224   writeCharCode(asciiZeroCodeUnit + digit);
//
// Subtracting a zero code point is the whole trick: digit sets are contiguous, so
// `code - zero` is the value and `0x30 + value` is the ASCII form. Deliberately NOT
// String.normalize('NFKC') - NFKC folds fullwidth digits and leaves Arabic-Indic alone, so
// a test written with fullwidth characters passes while the real case still logs a 0.
//
// One deviation, and it is the only one: Dart reads a single zero digit from the ACTIVE
// locale's symbols (`fa` -> U+06F0, `ar_EG` -> U+0660, most locales -> U+0030). No locale
// is injected here, so we carry both ranges CLDR actually assigns and fold whichever
// arrives. That is strictly broader than Dart - it accepts Persian digits from a device
// claiming en-US, which Dart would reject - and it needs no locale to be correct. If a
// locale is ever injected (see #146), narrow this to that locale's zero digit and the
// port becomes exact.
const ASCII_ZERO = 0x30
const LOCALE_ZEROS = [0x0660, 0x06f0] // Arabic-Indic, Extended Arabic-Indic

function foldDigits(raw: string): string {
  let out = ''
  for (const ch of raw) {
    const code = ch.codePointAt(0)!
    let folded = ch
    for (const localeZero of LOCALE_ZEROS) {
      const digitValue = code - localeZero
      if (digitValue >= 0 && digitValue <= 9) {
        folded = String.fromCharCode(ASCII_ZERO + digitValue)
        break
      }
    }
    out += folded
  }
  return out
}

// U+066B ARABIC DECIMAL SEPARATOR is a separator wherever those digits are. It is what
// Dart lists as DECIMAL_SEP for both `fa` and `ar_EG`, and folding the digits without it
// would leave "12٫5" as 125 - a silent 10x, worse than the zero this fixes. U+066C,
// their GROUP_SEP, needs no case: it falls through and is dropped like any other
// character, which is the same thing we do to a Latin thousands separator.
const isSeparator = (ch: string): boolean => ch === '.' || ch === ',' || ch === '٫'

// 'numeric' keeps digits only, so a separator cannot sneak a fractional rep in sideways.
export function sanitizeNumericInput(raw: string, mode: 'numeric' | 'decimal'): string {
  const folded = foldDigits(raw)
  if (mode !== 'decimal') return folded.replace(/[^0-9]/g, '')

  // Whitespace never counts as a separator. fr, ru, sv, pl, cs, fi, nb and uk group with
  // a space, so a trailing space or a pasted "12,50 kg" would otherwise read as 1250.
  const bare = folded.replace(/\s/g, '')

  let out = ''
  let seen = false
  for (const ch of bare) {
    if (ch >= '0' && ch <= '9') out += ch
    else if (isSeparator(ch) && !seen) {
      out += '.'
      seen = true
    }
  }
  return out
}

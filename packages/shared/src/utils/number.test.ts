import {
  BODYWEIGHT_STEP,
  PLATE_STEP,
  REP_STEP,
  clampStep,
  clampValue,
  configureNumberLocale,
  formatNumber,
  sanitizeNumericInput,
  toLocaleText,
} from './number'

// The stepping math behind every +/- button in the app. It used to be covered only
// through WeightInput's buttons; those moved to StepperTile (#91), so it's tested
// directly here instead of through whichever component happens to render it.
describe('clampStep', () => {
  it('steps by delta', () => {
    expect(clampStep(100, 2.5)).toBe(102.5)
    expect(clampStep(100, -2.5)).toBe(97.5)
  })

  it('keeps repeated tenths exact — no float dust', () => {
    // 183.6 + 0.1 is 183.70000000000002 in raw IEEE754.
    const up = clampStep(183.6, 0.1)
    expect(up).toBe(183.7)
    expect(clampStep(up, -0.1)).toBe(183.6)
  })

  it('never goes below min, which defaults to 0', () => {
    expect(clampStep(0, -0.1)).toBe(0)
    expect(clampStep(0.05, -1)).toBe(0)
    expect(clampStep(10, -1, { min: 5 })).toBe(9)
    expect(clampStep(5, -1, { min: 5 })).toBe(5)
  })

  it('never goes above max', () => {
    expect(clampStep(999, 2.5, { max: 1000 })).toBe(1000)
    expect(clampStep(100, 2.5, { max: 1000 })).toBe(102.5)
  })

  it('treats a non-finite base as 0 — an empty field steps up from nothing', () => {
    expect(clampStep(NaN, 0.1)).toBe(0.1)
    expect(clampStep(Infinity, 0.1)).toBe(0.1)
  })
})

describe('stepper increments', () => {
  // Locks the three apart. They answer different questions (a body's daily drift, a
  // barbell's smallest plate pair, whole reps) and collapsing any two would silently
  // change what a button does on a screen nobody was looking at.
  it('are distinct, and bodyweight is the finest', () => {
    expect(BODYWEIGHT_STEP).toBe(0.1)
    expect(PLATE_STEP).toBe(2.5)
    expect(REP_STEP).toBe(1)
    expect(new Set([BODYWEIGHT_STEP, PLATE_STEP, REP_STEP]).size).toBe(3)
  })

  it('bodyweight is as fine as clampStep can express', () => {
    expect(clampStep(100, BODYWEIGHT_STEP)).toBe(100.1)
    // Half a step vanishes: clampStep rounds to 1dp, and 100.05 lands just under the
    // midpoint in IEEE754 so toFixed(1) takes it back to 100. A step finer than
    // BODYWEIGHT_STEP would be a button that does nothing — hence the floor.
    expect(clampStep(100, BODYWEIGHT_STEP / 2)).toBe(100)
  })
})

describe('clampValue', () => {
  it('parses strings and numbers, flooring at min', () => {
    expect(clampValue('170.3')).toBe(170.3)
    expect(clampValue(170.3)).toBe(170.3)
    expect(clampValue('-5')).toBe(0)
    expect(clampValue('-5', 1)).toBe(1)
  })

  it('falls back to min on junk', () => {
    expect(clampValue('')).toBe(0)
    expect(clampValue('abc')).toBe(0)
    expect(clampValue('abc', 5)).toBe(5)
  })
})

// #141: a German user could not enter a decimal weight at all. Android's decimal-pad
// draws the locale's separator and the field deleted it as "not a digit", so these are
// the cases that bug is made of - plus the ones wger hit when they fixed the same report
// against their Flutter app (wger-project/flutter#1147).
describe('sanitizeNumericInput', () => {
  const dec = (s: string) => sanitizeNumericInput(s, 'decimal')

  it('accepts a comma as the decimal separator - the reported bug', () => {
    expect(dec('12,5')).toBe('12.5')
  })

  it('accepts a dot too, whatever the locale', () => {
    // The keypad may emit either: a numeric keyboard cannot be pinned to a locale.
    expect(dec('12.5')).toBe('12.5')
  })

  it('keeps a half-typed separator, so the fraction digit can still be typed', () => {
    expect(dec('12,')).toBe('12.')
    expect(dec('12.')).toBe('12.')
  })

  it('takes the FIRST separator, whichever kinds appear', () => {
    // A TextInput re-sends the whole field per keystroke and the cursor can sit inside a
    // prefilled value, so preferring the last would turn one keypress in "82,5" into 825
    // - a silent 10x that backspace cannot undo.
    expect(dec('82,5,')).toBe('82.5')
    expect(dec('12.5.')).toBe('12.5')
  })

  it('does not guess which character was grouping - same rule as wger', () => {
    // Telling grouping from a decimal needs the locale's own separator, and then the
    // other character is grouping by definition (react-aria and Expensify both do that).
    // No locale is injected here, so a pasted grouped number keeps the first separator
    // rather than being second-guessed. Typing is unaffected, which is the reported path.
    expect(dec('1.234,5')).toBe('1.2345')
    expect(dec('1,234.5')).toBe('1.2345')
  })

  it('never reads whitespace as a separator', () => {
    // fr, ru, sv, pl, cs, fi, nb and uk group with a space.
    expect(dec('12,50 kg')).toBe('12.50')
    expect(dec('12,5 ')).toBe('12.5')
  })

  it('drops everything that is not a digit or a separator', () => {
    expect(dec('abc12,5kg')).toBe('12.5')
    expect(dec('-12,5')).toBe('12.5')
  })

  it('does not detect grouping - it cannot be, mid-type', () => {
    // "1," arrives with nothing after it, so a grouping-aware rule works on paste and
    // lies while typing. 1,200 is 1.2 by both routes, deliberately. wger agrees.
    expect(dec('1,200')).toBe('1.200')
  })

  it('refuses a separator in numeric mode, so reps stay whole', () => {
    expect(sanitizeNumericInput('8,5', 'numeric')).toBe('85')
    expect(sanitizeNumericInput('8.5', 'numeric')).toBe('85')
  })

  // Ported from Dart's intl (number_parser_base.dart), which is what wger's own
  // NumberFormat.parse runs on. Their widget's filter is ASCII-only and strips these
  // before the parser ever sees them, so this is a case their app still gets wrong.
  it('folds localised digits instead of deleting them', () => {
    expect(dec('١٢٫٥')).toBe('12.5') // ar_EG: Arabic-Indic
    expect(dec('۱۲٫۵')).toBe('12.5') // fa: Extended Arabic-Indic
    expect(sanitizeNumericInput('٨٥', 'numeric')).toBe('85')
  })

  it('reads U+066B, the decimal separator those keypads emit', () => {
    // Folding the digits alone would leave this as 125 - a silent 10x, worse than the
    // zero it fixes. Dart lists U+066B as DECIMAL_SEP for both fa and ar_EG.
    expect(dec('12٫5')).toBe('12.5')
  })

  it('drops U+066C, their group separator, like any other thousands mark', () => {
    expect(dec('1٬234٫5')).toBe('1234.5')
  })

  it('leaves an empty field empty', () => {
    expect(dec('')).toBe('')
    expect(dec(',')).toBe('.')
  })
})

describe('toLocaleText', () => {
  afterEach(() => configureNumberLocale({ locale: 'en-US' }))

  it('is a no-op on a full-stop locale', () => {
    expect(toLocaleText('12.5')).toBe('12.5')
    expect(toLocaleText('')).toBe('')
  })

  it('draws the locale separator', () => {
    configureNumberLocale({ locale: 'de-DE' })
    expect(toLocaleText('12.5')).toBe('12,5')
  })

  // The reason this is text-level and not Number()-based: mid-typing, "12." must keep
  // the separator the user just pressed. Number('12.') is 12, which would delete it.
  it('survives a half-typed value', () => {
    configureNumberLocale({ locale: 'de-DE' })
    expect(toLocaleText('12.')).toBe('12,')
  })

  it('round-trips with sanitizeNumericInput on a comma locale', () => {
    configureNumberLocale({ locale: 'de-DE' })
    const typed = '12,5'
    const stored = sanitizeNumericInput(typed, 'decimal')
    expect(stored).toBe('12.5')          // canonical for every caller
    expect(Number(stored)).toBe(12.5)     // Number() still works, so no call site changed
    expect(toLocaleText(stored)).toBe(typed) // and the user sees what they typed
  })
})

// Everything below came out of an adversarial review that drove the REAL per-keystroke
// loop instead of calling the function with whole strings. A TextInput re-sends the entire
// field on every key, so `sanitize(toLocaleText(buffer) + key)` is the shape that actually
// runs — and three defects lived only in that shape.
describe('sanitizeNumericInput under per-keystroke input', () => {
  afterEach(() => configureNumberLocale({ locale: 'en-US' }))

  const type = (keys: string) =>
    [...keys].reduce((buf, k) => sanitizeNumericInput(toLocaleText(buf) + k, 'decimal'), '')

  // The cells have no selectTextOnFocus, so tapping a prefilled "82,5" drops the cursor
  // inside a string that already holds a separator. Taking the LAST separator as the
  // decimal turned that into "825." — a silent 10x, committed on the same keystroke, that
  // backspace could not undo because the fraction digit had become an integer digit.
  it('keeps the first separator when a second is inserted', () => {
    configureNumberLocale({ locale: 'de-DE' })
    expect(type('82,5,')).toBe('82.5')
    expect(sanitizeNumericInput('82.5.', 'decimal')).toBe('82.5')
    expect(sanitizeNumericInput('225.5.', 'decimal')).toBe('225.5')
  })

  it('types a plain decimal correctly on a comma locale', () => {
    configureNumberLocale({ locale: 'de-DE' })
    expect(type('12,5')).toBe('12.5')
    expect(type('102,5')).toBe('102.5')
  })

  // The same rule one keystroke later: a DIGIT after the second separator, not the end of
  // the string. Reached a real screen during device testing — a cell briefly read
  // "45.5.5" because the field had not been fully cleared before typing. The trailing
  // cases above would have passed while this one silently produced a different number, so
  // it is pinned separately.
  it('keeps the first separator when a digit follows the second', () => {
    expect(sanitizeNumericInput('45.5.5', 'decimal')).toBe('45.55')
    expect(sanitizeNumericInput('1.2.3.4', 'decimal')).toBe('1.234')
    configureNumberLocale({ locale: 'de-DE' })
    expect(sanitizeNumericInput('45,5,5', 'decimal')).toBe('45.55')
  })

  it('types a plain decimal correctly on en-US', () => {
    expect(type('12.5')).toBe('12.5')
  })

  // Grouping is not detected at all, by design, so the typed and pasted paths now agree.
  // The earlier grouping-aware rule made these two disagree - 1.2 typed, 1200 pasted -
  // which is the kind of split nobody can reproduce from a bug report.
  it('reads a lone separator the same way typed or pasted', () => {
    expect(type('1,200')).toBe('1.200')
    expect(sanitizeNumericInput('1,200', 'decimal')).toBe('1.200')
  })
})

// fr, ru, sv, pl, cs, fi, nb, uk all use a space as the group character, and
// expo-localization hands it over verbatim. Treating it as a separator candidate made any
// space in the text the decimal point.
describe('sanitizeNumericInput with a space group separator', () => {
  afterEach(() => configureNumberLocale({ locale: 'en-US' }))

  for (const [name, sp] of [
    ['space', '\u0020'],
    ['no-break space', '\u00A0'],
    ['narrow no-break space', '\u202F'],
  ] as const) {
    it(`ignores a ${name} rather than reading it as a decimal`, () => {
      configureNumberLocale({ locale: 'fr-FR' })
      expect(sanitizeNumericInput(`12,50${sp}kg`, 'decimal')).toBe('12.50')
      expect(sanitizeNumericInput(`82,5${sp}kg`, 'decimal')).toBe('82.5')
      expect(sanitizeNumericInput(`12,5${sp}`, 'decimal')).toBe('12.5')
      expect(sanitizeNumericInput(`1${sp}250`, 'decimal')).toBe('1250')
      // the group character is no longer consulted at all - only whitespace stripping
      // keeps this correct, which is why that step stays.
    })
  }

  it('ignores a trailing space on any locale', () => {
    expect(sanitizeNumericInput('12.5 ', 'decimal')).toBe('12.5')
  })
})

describe('toLocaleText hardening', () => {
  afterEach(() => configureNumberLocale({ locale: 'en-US' }))

  // Threw on every comma locale and silently passed the value through on en-US — so it
  // would have crashed only for the users this change exists for, and only in production.
  it('does not throw on a non-string, in any locale', () => {
    configureNumberLocale({ locale: 'de-DE' })
    // @ts-expect-error deliberately wrong type
    expect(toLocaleText(undefined)).toBe('')
    // @ts-expect-error deliberately wrong type
    expect(toLocaleText(null)).toBe('')
    // @ts-expect-error deliberately wrong type
    expect(toLocaleText(12.5)).toBe('')
  })
})

// The piece that closes the loop: a stored number -> the text a person reads. Before it
// existed every card, chip and chart tick did its own String(n) or n.toFixed(1) and drew a
// full stop regardless of locale, so a German user could see "83,4" in the field and
// "83.4" in the caption beside it.
describe('formatNumber', () => {
  afterEach(() => configureNumberLocale({ locale: 'en-US' }))

  // Note the split: `decimal`/`group` drive PARSING, because JavaScript has no number
  // parser and sanitizeNumericInput has to be told which character is the separator.
  // `locale` drives DISPLAY, because Intl does that job and wants a locale, not two
  // characters. Both real call sites pass all three; a test that sets only the
  // separators would silently format as en-US, which is what these afterEach/beforeEach
  // pairs exist to prevent.
  const asLocale = (tag: string) => configureNumberLocale({ locale: tag })

  it('is the plain number on en-US', () => {
    expect(formatNumber(83.4)).toBe('83.4')
    expect(formatNumber(120)).toBe('120')
  })

  it('draws the locale separator', () => {
    asLocale('de-DE')
    expect(formatNumber(83.4)).toBe('83,4')
    expect(formatNumber(102.5)).toBe('102,5')
  })

  it('honours a fixed decimal count', () => {
    asLocale('de-DE')
    expect(formatNumber(83, { decimals: 1 })).toBe('83,0')
    expect(formatNumber(83.44, { decimals: 1 })).toBe('83,4')
    expect(formatNumber(83.456, { decimals: 2 })).toBe('83,46')
  })

  // Opt-in, because "1 234,5" reads worse than "1234,5" for a bodyweight but a volume
  // total wants it.
  it('groups only when asked', () => {
    expect(formatNumber(1234.5)).toBe('1234.5')
    expect(formatNumber(1234.5, { grouped: true })).toBe('1,234.5')
    asLocale('de-DE')
    expect(formatNumber(1234.5, { grouped: true })).toBe('1.234,5')
  })

  // The reason this delegates to Intl rather than grouping every three digits by hand:
  // grouping is CLDR data, not arithmetic. The hand-rolled version rendered 12,345,678.9
  // here, which is not how anyone in India writes it.
  it('groups by the locale system, not every three digits', () => {
    asLocale('en-IN')
    expect(formatNumber(12345678.9, { grouped: true })).toBe('1,23,45,678.9')
  })

  it('leaves short integers alone when grouping', () => {
    expect(formatNumber(999, { grouped: true })).toBe('999')
    expect(formatNumber(1000, { grouped: true })).toBe('1,000')
  })

  it('handles negatives', () => {
    asLocale('de-DE')
    expect(formatNumber(-4.6)).toBe('-4,6')
    expect(formatNumber(-1234.5, { grouped: true })).toBe('-1.234,5')
  })

  // Every call site renders a possibly-absent number, so the empty cases have to be text
  // rather than "NaN" or "undefined" landing on screen.
  it('renders nothing rather than junk for absent or invalid values', () => {
    expect(formatNumber(null)).toBe('')
    expect(formatNumber(undefined)).toBe('')
    expect(formatNumber('')).toBe('')
    expect(formatNumber(NaN)).toBe('')
    expect(formatNumber(Infinity)).toBe('')
    expect(formatNumber('abc')).toBe('')
  })

  it('accepts a numeric string, which is what most call sites already hold', () => {
    asLocale('de-DE')
    expect(formatNumber('83.4')).toBe('83,4')
  })

  // The loop is closed for ungrouped text: what a field draws, a field can read back.
  // Grouped output deliberately does NOT round-trip - the parser does not detect grouping -
  // so `grouped: true` is for read-only display and must never feed an editable field.
  // This is the one place wger gets it wrong: their widget formats with grouping and their
  // input filter then eats it, so editing a formatted "1.234,5" yields 1,23.
  it('round-trips through sanitizeNumericInput', () => {
    asLocale('de-DE')
    for (const n of [0.5, 12.5, 83.4, 102.5, 225, 1234.5]) {
      expect(Number(sanitizeNumericInput(formatNumber(n), 'decimal'))).toBe(n)
    }
  })

  it('agrees with toLocaleText for a value already held as text', () => {
    asLocale('de-DE')
    expect(formatNumber(102.5)).toBe(toLocaleText('102.5'))
  })
})

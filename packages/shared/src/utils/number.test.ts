import {
  BODYWEIGHT_STEP,
  PLATE_STEP,
  REP_STEP,
  clampStep,
  clampValue,
  configureNumberLocale,
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

describe('sanitizeNumericInput', () => {
  // The en-US default comes from the module literal in number.ts, not from any mock -
  // this package is plain ts-jest and never imports expo-localization. Every test that
  // doesn't configure a locale is therefore an en-US test, worth stating because the bug
  // this file exists for only appears outside that locale.
  afterEach(() => configureNumberLocale({ decimal: '.', group: ',' }))

  describe('en-US (the default)', () => {
    it('takes a full stop', () => {
      expect(sanitizeNumericInput('12.5', 'decimal')).toBe('12.5')
    })

    // #141: an Android decimal-pad shows the locale's separator, and on a comma locale
    // there is often no full stop to type instead. Accepting a comma regardless is what
    // react-number-format does by default (allowedDecimalSeparators = [sep, '.']).
    it('takes a comma too, since keypads emit one either way', () => {
      expect(sanitizeNumericInput('12,5', 'decimal')).toBe('12.5')
    })

    // Was 1.2 before localization landed - a silent 1000x error on a plain en-US input.
    it('reads a grouping comma as grouping, not as a decimal', () => {
      expect(sanitizeNumericInput('1,200', 'decimal')).toBe('1200')
    })

    it('resolves both separators by taking the last as the decimal', () => {
      expect(sanitizeNumericInput('1,234.5', 'decimal')).toBe('1234.5')
    })

    // Typing "12," must leave the separator alone or the field fights the user before
    // they can reach the fractional digit.
    it('keeps a trailing separator mid-typing', () => {
      expect(sanitizeNumericInput('12,', 'decimal')).toBe('12.')
      expect(sanitizeNumericInput('12.', 'decimal')).toBe('12.')
    })

    it('handles a leading separator', () => {
      expect(sanitizeNumericInput(',5', 'decimal')).toBe('.5')
    })

    it('rejects letters, signs and units', () => {
      expect(sanitizeNumericInput('-1a2b.5kg', 'decimal')).toBe('12.5')
      expect(sanitizeNumericInput('12,50 kg', 'decimal')).toBe('12.50')
    })

    it('passes empty and junk through as empty', () => {
      expect(sanitizeNumericInput('', 'decimal')).toBe('')
      expect(sanitizeNumericInput('abc', 'decimal')).toBe('')
    })
  })

  describe('de-DE', () => {
    beforeEach(() => configureNumberLocale({ decimal: ',', group: '.' }))

    it('reads a comma as the decimal', () => {
      expect(sanitizeNumericInput('12,5', 'decimal')).toBe('12.5')
    })

    it('reads a grouping full stop as grouping', () => {
      expect(sanitizeNumericInput('1.200', 'decimal')).toBe('1200')
    })

    it('resolves 1.234,5 correctly', () => {
      expect(sanitizeNumericInput('1.234,5', 'decimal')).toBe('1234.5')
    })

    // A German keypad shows both characters, so someone may still type a full stop
    // meaning a decimal. One separator with fewer than three trailing digits can't be
    // grouping, so it is read as the decimal.
    it('still accepts a full stop as a decimal', () => {
      expect(sanitizeNumericInput('12.5', 'decimal')).toBe('12.5')
    })
  })

  describe('ar (Arabic-Indic digits)', () => {
    beforeEach(() => configureNumberLocale({ decimal: '\u066B', group: '\u066C' }))

    // Before the digit fold this produced '' -> Number('') || 0 -> a bodyweight of 0,
    // logged silently. NFKC does not fold these, so the fold is arithmetic.
    it('folds Arabic-Indic digits instead of deleting them', () => {
      expect(sanitizeNumericInput('\u0661\u0662\u066B\u0665', 'decimal')).toBe('12.5')
    })

    it('folds Extended Arabic-Indic digits', () => {
      expect(sanitizeNumericInput('\u06F1\u06F2', 'decimal')).toBe('12')
    })

    // Adobe's parser notes that Arabic keypads mostly emit an ASCII comma rather than
    // U+066B, so that path has to work too.
    it('takes an ASCII comma from an Arabic keypad', () => {
      expect(sanitizeNumericInput('\u0661\u0662,\u0665', 'decimal')).toBe('12.5')
    })
  })

  describe('numeric mode', () => {
    it('drops every separator so reps stay whole', () => {
      expect(sanitizeNumericInput('12,5', 'numeric')).toBe('125')
      expect(sanitizeNumericInput('12.5', 'numeric')).toBe('125')
    })

    it('still folds non-ASCII digits', () => {
      expect(sanitizeNumericInput('\u0661\u0662', 'numeric')).toBe('12')
    })

    it('is unaffected by grouping, so a 2,000 calorie target reads as 2000', () => {
      expect(sanitizeNumericInput('2,000', 'numeric')).toBe('2000')
    })
  })
})

// The other half of the round trip. sanitizeNumericInput keeps the stored text canonical
// so no caller has to learn a second notation; this is what the field actually draws.
// Without it the trip is asymmetric — a German user types "12,5", it stores as 12.5, and
// the field redraws "12.5", quietly rewriting what they typed. wger states the principle:
// display and parsing go through one format, so a value can't be mis-read across locales.
describe('toLocaleText', () => {
  afterEach(() => configureNumberLocale({ decimal: '.', group: ',' }))

  it('is a no-op on a full-stop locale', () => {
    expect(toLocaleText('12.5')).toBe('12.5')
    expect(toLocaleText('')).toBe('')
  })

  it('draws the locale separator', () => {
    configureNumberLocale({ decimal: ',', group: '.' })
    expect(toLocaleText('12.5')).toBe('12,5')
  })

  // The reason this is text-level and not Number()-based: mid-typing, "12." must keep
  // the separator the user just pressed. Number('12.') is 12, which would delete it.
  it('survives a half-typed value', () => {
    configureNumberLocale({ decimal: ',', group: '.' })
    expect(toLocaleText('12.')).toBe('12,')
  })

  it('round-trips with sanitizeNumericInput on a comma locale', () => {
    configureNumberLocale({ decimal: ',', group: '.' })
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
  afterEach(() => configureNumberLocale({ decimal: '.', group: ',' }))

  const type = (keys: string) =>
    [...keys].reduce((buf, k) => sanitizeNumericInput(toLocaleText(buf) + k, 'decimal'), '')

  // The cells have no selectTextOnFocus, so tapping a prefilled "82,5" drops the cursor
  // inside a string that already holds a separator. Taking the LAST separator as the
  // decimal turned that into "825." — a silent 10x, committed on the same keystroke, that
  // backspace could not undo because the fraction digit had become an integer digit.
  it('keeps the first separator when a second is inserted', () => {
    configureNumberLocale({ decimal: ',', group: '.' })
    expect(type('82,5,')).toBe('82.5')
    expect(sanitizeNumericInput('82.5.', 'decimal')).toBe('82.5')
    expect(sanitizeNumericInput('225.5.', 'decimal')).toBe('225.5')
  })

  it('types a plain decimal correctly on a comma locale', () => {
    configureNumberLocale({ decimal: ',', group: '.' })
    expect(type('12,5')).toBe('12.5')
    expect(type('102,5')).toBe('102.5')
  })

  it('types a plain decimal correctly on en-US', () => {
    expect(type('12.5')).toBe('12.5')
  })

  // KNOWN LIMIT, documented on the function: grouping can't be recognised mid-type,
  // because "1," arrives with nothing after it and is canonicalised to "1." before the
  // digits that would identify it as grouping ever show up. Pinned so the behaviour is a
  // decision rather than a surprise, and so the paste path's guarantee stays honest.
  it('cannot recognise grouping while it is being typed', () => {
    expect(type('1,200')).toBe('1.200')
    expect(sanitizeNumericInput('1,200', 'decimal')).toBe('1200')
  })
})

// fr, ru, sv, pl, cs, fi, nb, uk all use a space as the group character, and
// expo-localization hands it over verbatim. Treating it as a separator candidate made any
// space in the text the decimal point.
describe('sanitizeNumericInput with a space group separator', () => {
  afterEach(() => configureNumberLocale({ decimal: '.', group: ',' }))

  for (const [name, sp] of [
    ['space', '\u0020'],
    ['no-break space', '\u00A0'],
    ['narrow no-break space', '\u202F'],
  ] as const) {
    it(`ignores a ${name} rather than reading it as a decimal`, () => {
      configureNumberLocale({ decimal: ',', group: sp })
      expect(sanitizeNumericInput(`12,50${sp}kg`, 'decimal')).toBe('12.50')
      expect(sanitizeNumericInput(`82,5${sp}kg`, 'decimal')).toBe('82.5')
      expect(sanitizeNumericInput(`12,5${sp}`, 'decimal')).toBe('12.5')
      expect(sanitizeNumericInput(`1${sp}250`, 'decimal')).toBe('1250')
    })
  }

  it('ignores a trailing space on any locale', () => {
    expect(sanitizeNumericInput('12.5 ', 'decimal')).toBe('12.5')
  })
})

describe('toLocaleText hardening', () => {
  afterEach(() => configureNumberLocale({ decimal: '.', group: ',' }))

  // Threw on every comma locale and silently passed the value through on en-US — so it
  // would have crashed only for the users this change exists for, and only in production.
  it('does not throw on a non-string, in any locale', () => {
    configureNumberLocale({ decimal: ',', group: '.' })
    // @ts-expect-error deliberately wrong type
    expect(toLocaleText(undefined)).toBe('')
    // @ts-expect-error deliberately wrong type
    expect(toLocaleText(null)).toBe('')
    // @ts-expect-error deliberately wrong type
    expect(toLocaleText(12.5)).toBe('')
  })
})

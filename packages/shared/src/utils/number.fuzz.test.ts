import { configureNumberLocale, formatNumber, sanitizeNumericInput, toLocaleText } from './number'

// Adversarial pass: instead of asking "does 12,5 work", assert the properties that must
// hold for EVERY string a keyboard could produce, in every locale family the app can be
// configured into, and let a generator go looking for the counterexample.
//
// Deterministic on purpose — a seeded LCG, not Math.random — so a failure here is a
// failure everyone can reproduce rather than a flake someone reruns until it passes.
let seed = 0x5eed
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length) % xs.length]

// Every character class that has ever mattered here: both ASCII separators, the space
// that fr/ru/sv/pl use for grouping (plain, NBSP and the narrow NBSP that CLDR actually
// emits), Arabic-Indic and Extended Arabic-Indic digits, the Arabic decimal separator,
// and the signs/exponent a keypad or a paste can deliver.
const ALPHABET = [
  ...'0123456789',
  '.', ',', ' ', ' ', ' ', '٫', '٬',
  '٠', '١', '٢', '٥', '٩', '۰', '۵', '۹',
  '-', '+', 'e', 'E', 'kg', 'lb', '\t', '\n',
]

const LOCALES = ['en-US', 'de-DE', 'fr-FR', 'ar-EG', 'fa-IR', 'hi-IN', 'en-IN', 'sv-SE', 'ru-RU', 'pl-PL', 'cs-CZ', 'ch-DE']

const randomInput = () => {
  const n = Math.floor(rnd() * 12)
  let s = ''
  for (let i = 0; i < n; i++) s += pick(ALPHABET)
  return s
}

// Hand-picked nasties alongside the generated ones — the shapes a generator is unlikely
// to stumble onto but a real user or a paste produces immediately.
const CORPUS = [
  '', ' ', '.', ',', '..', ',,', '.,', ',.', '-', '+', 'e', '-.', '0', '00', '007',
  '12', '12.', '12,', '.5', ',5', '12.5', '12,5', '1.234,5', '1,234.5', '1 234,5',
  '1 234,5', '1 234,5', '12,50 kg', '  12,5  ', '12.5.5', '1.2.3.4', '82,5,',
  '-12.5', '+12.5', '1e3', '1E3', '١٢٫٥', '١٢,٥', '۱۲٫۵', '12٫5', '9'.repeat(30),
  '0.0000001', '12.5\n', '\t12.5', 'kg12.5lb', '.'.repeat(10), '1'.repeat(400),
]

const DECIMAL_SHAPE = /^\d*\.?\d*$/
const INTEGER_SHAPE = /^\d*$/

describe('sanitizeNumericInput holds its invariants under fuzzing', () => {
  afterEach(() => configureNumberLocale({ locale: 'en-US' }))

  const inputs = () => {
    const generated: string[] = []
    for (let i = 0; i < 600; i++) generated.push(randomInput())
    return [...CORPUS, ...generated]
  }

  it('only ever emits digits and at most one full stop, in every locale', () => {
    for (const locale of LOCALES) {
      configureNumberLocale({ locale })
      for (const raw of inputs()) {
        const dec = sanitizeNumericInput(raw, 'decimal')
        const int = sanitizeNumericInput(raw, 'numeric')
        if (!DECIMAL_SHAPE.test(dec)) throw new Error(`decimal ${locale} ${JSON.stringify(raw)} -> ${JSON.stringify(dec)}`)
        if (!INTEGER_SHAPE.test(int)) throw new Error(`numeric ${locale} ${JSON.stringify(raw)} -> ${JSON.stringify(int)}`)
      }
    }
  })

  // The output is fed back in on the next keystroke, so a second pass that changed
  // anything would mean the field drifts while the user is still typing.
  it('is idempotent — a sanitized value sanitizes to itself', () => {
    for (const locale of LOCALES) {
      configureNumberLocale({ locale })
      for (const raw of inputs()) {
        for (const mode of ['decimal', 'numeric'] as const) {
          const once = sanitizeNumericInput(raw, mode)
          const twice = sanitizeNumericInput(once, mode)
          if (once !== twice) throw new Error(`not idempotent ${locale} ${mode} ${JSON.stringify(raw)}: ${JSON.stringify(once)} -> ${JSON.stringify(twice)}`)
        }
      }
    }
  })

  // Anything that survives must be a number, never NaN. Note the contract this asserts
  // and the one it does not: sanitize owns the SHAPE of the text, so NaN is its bug.
  // Magnitude is not — a value can be well-formed and still be more than the app should
  // accept, and rejecting that is what weightError and the field's own bounds are for.
  //
  // The first version of this asserted Number.isFinite and the generator promptly found
  // the difference: 310 digits, which is where Number() stops being finite. See the
  // boundary test below for what that means in practice.
  it('emits nothing that Number() reads as NaN, apart from the in-progress states', () => {
    for (const locale of LOCALES) {
      configureNumberLocale({ locale })
      for (const raw of inputs()) {
        const out = sanitizeNumericInput(raw, 'decimal')
        if (out === '' || out === '.') continue
        if (Number.isNaN(Number(out))) throw new Error(`unparseable ${locale} ${JSON.stringify(raw)} -> ${JSON.stringify(out)}`)
      }
    }
  })

  // Found by the fuzzer, kept as documentation of a real boundary rather than a wish.
  // A pasted string of ~310 digits is well-formed text that Number() turns into Infinity,
  // and the two platforms diverge from there:
  //
  //   web    weightError rejects it — !Number.isFinite is the first thing it checks
  //   mobile the set cells have no such gate. Infinity is stored, the cell redraws as the
  //          literal "Infinity", and JSON.stringify sends null to the backend.
  //
  // Reachable only by pasting 310+ characters and predating this change, so it is pinned
  // here rather than fixed in passing — sanitize is not the layer that should own it.
  it('leaves an overflowing paste well-formed but infinite, which validation must catch', () => {
    configureNumberLocale({ locale: 'en-US' })
    expect(sanitizeNumericInput('1'.repeat(309), 'decimal')).toBe('1'.repeat(309))
    expect(Number.isFinite(Number('1'.repeat(309)))).toBe(true)
    expect(Number.isFinite(Number('1'.repeat(310)))).toBe(false)
    // and the shape guarantee still holds either side of that line
    expect(DECIMAL_SHAPE.test(sanitizeNumericInput('1'.repeat(400), 'decimal'))).toBe(true)
  })

  it('never throws, whatever it is handed', () => {
    for (const locale of LOCALES) {
      configureNumberLocale({ locale })
      for (const raw of inputs()) {
        expect(() => sanitizeNumericInput(raw, 'decimal')).not.toThrow()
        expect(() => toLocaleText(sanitizeNumericInput(raw, 'decimal'))).not.toThrow()
        expect(() => formatNumber(sanitizeNumericInput(raw, 'decimal'))).not.toThrow()
      }
    }
  })

  // The full round trip a field performs on every keystroke: canonical buffer -> drawn in
  // the locale's notation -> handed straight back by the TextInput -> sanitized again.
  // If that is not the identity, the field rewrites what the user typed as they type it.
  it('round-trips canonical text through the locale notation unchanged', () => {
    for (const locale of LOCALES) {
      configureNumberLocale({ locale })
      for (const raw of inputs()) {
        const canonical = sanitizeNumericInput(raw, 'decimal')
        const back = sanitizeNumericInput(toLocaleText(canonical), 'decimal')
        if (back !== canonical) throw new Error(`round trip ${locale} ${JSON.stringify(canonical)} -> drew ${JSON.stringify(toLocaleText(canonical))} -> ${JSON.stringify(back)}`)
      }
    }
  })

  // The other direction: text the app DREW, handed back to the parser. Not a path a
  // screen takes today — fields prefill from String(displayWeight(...)), not formatNumber
  // — but it is one paste away (a user copying a number off a card into a field), and it
  // is where the grouping systems are most likely to disagree.
  //
  // Worth it for the awkward ones specifically: en-IN groups by lakh/crore rather than
  // threes, fr-FR groups with a narrow no-break space, de-CH with an apostrophe, and
  // ar-EG draws both its digits and its separators in Arabic.
  it('parses its own ungrouped output back to the same number', () => {
    const values = [0, 1, 1.5, 12.5, 999, 1000, 1234.5, 45678.9, 12345678.9, 0.1, 2000]
    for (const locale of LOCALES) {
      configureNumberLocale({ locale })
      for (const v of values) {
        const drawn = formatNumber(v, { grouped: false })
        const back = Number(sanitizeNumericInput(drawn, 'decimal'))
        if (back !== v) throw new Error(`${locale}: ${v} drew ${JSON.stringify(drawn)} -> parsed ${back}`)
      }
    }
  })

  // Grouped output deliberately does NOT survive the trip, and asserting that it did is
  // how this test first failed. Worth stating plainly, because it looks like a bug and is
  // the single most likely thing for someone to "fix":
  //
  //   a thousands separator cannot be recognised while it is being typed. "1," arrives
  //   with nothing after it, and at that instant it is indistinguishable from the start of
  //   a decimal. Any rule that reads grouping therefore works on paste and lies on the
  //   typed path — which is the path people use. So grouping is never detected, and
  //   "1,000" reads as 1. wger does not attempt it either.
  //
  // The cost is confined to paste, and it is the deliberate half of the trade.
  it('does not pretend to understand grouping, on any locale', () => {
    configureNumberLocale({ locale: 'en-US' })
    expect(sanitizeNumericInput('1,000', 'decimal')).toBe('1.000')
    expect(sanitizeNumericInput('1,200', 'decimal')).toBe('1.200')
    configureNumberLocale({ locale: 'de-DE' })
    expect(sanitizeNumericInput('1.000', 'decimal')).toBe('1.000')
  })

  // The real loop: a TextInput re-sends the whole field on every key. Typing a plain
  // number one character at a time must produce that number, in every locale.
  it('types a plain decimal correctly, one keystroke at a time, in every locale', () => {
    const type = (keys: string) =>
      [...keys].reduce((buf, k) => sanitizeNumericInput(toLocaleText(buf) + k, 'decimal'), '')
    for (const locale of LOCALES) {
      configureNumberLocale({ locale })
      const sep = toLocaleText('.')
      for (const [keys, want] of [
        [`12${sep}5`, '12.5'],
        [`0${sep}1`, '0.1'],
        [`225${sep}75`, '225.75'],
        [`9${sep}9`, '9.9'],
      ] as const) {
        const got = type(keys)
        if (got !== want) throw new Error(`typing ${JSON.stringify(keys)} in ${locale} gave ${JSON.stringify(got)}, wanted ${want}`)
      }
    }
  })
})

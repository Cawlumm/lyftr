import { BODYWEIGHT_STEP, PLATE_STEP, REP_STEP, clampStep, clampValue, sanitizeNumericInput } from './number'

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

  it('leaves an empty field empty', () => {
    expect(dec('')).toBe('')
    expect(dec(',')).toBe('.')
  })
})

import { fmtClock, nextIncompleteSet, formatElapsed, restLabel, numericRange } from './workoutSets'
import { configureNumberLocale } from './number'

describe('fmtClock', () => {
  it('formats seconds as m:ss with zero-padding', () => {
    expect(fmtClock(90)).toBe('1:30')
    expect(fmtClock(5)).toBe('0:05')
    expect(fmtClock(600)).toBe('10:00')
    expect(fmtClock(0)).toBe('0:00')
  })
})

describe('nextIncompleteSet', () => {
  it('returns the first not-completed set after the given index', () => {
    const sets = [{ completed: true }, { completed: false }, { completed: false }]
    expect(nextIncompleteSet(sets, 0)).toBe(1)
  })

  it('returns -1 when every set after the index is completed', () => {
    expect(nextIncompleteSet([{ completed: false }, { completed: true }], 0)).toBe(-1)
  })

  it('returns -1 for an empty list', () => {
    expect(nextIncompleteSet([], 0)).toBe(-1)
  })
})

describe('formatElapsed', () => {
  it('zero-pads the minute so the digits do not jump past 9:59', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(90)).toBe('01:30')
    expect(formatElapsed(599)).toBe('09:59')
    expect(formatElapsed(600)).toBe('10:00')
  })

  it('adds an hours part only once past an hour', () => {
    expect(formatElapsed(3599)).toBe('59:59')
    expect(formatElapsed(3600)).toBe('1:00:00')
    expect(formatElapsed(3661)).toBe('1:01:01')
  })
})

describe('restLabel', () => {
  it('collapses whole minutes', () => {
    expect(restLabel(60)).toBe('1m')
    expect(restLabel(180)).toBe('3m')
  })

  it('keeps anything else in seconds', () => {
    expect(restLabel(90)).toBe('90s')
    expect(restLabel(45)).toBe('45s')
    expect(restLabel(0)).toBe('0s')
  })
})

describe('numericRange', () => {
  it('shows a single value when every set matches', () => {
    expect(numericRange([8, 8, 8])).toBe('8')
  })

  it('shows low–high when they differ', () => {
    expect(numericRange([12, 8, 10])).toBe('8–12')
  })

  it('shows an em dash for no values', () => {
    expect(numericRange([])).toBe('—')
  })

  // This feeds gym mode's Weight tile, not just Reps. It used to build its string with
  // String()/template interpolation, so a 45.5 kg spread drew "45.5" on a device that
  // writes 45,5 — the one weight left reaching a screen without the shared formatter.
  it('draws a decimal spread in the reader notation', () => {
    configureNumberLocale({ locale: 'de-DE' })
    expect(numericRange([45.5])).toBe('45,5')
    expect(numericRange([45.5, 60])).toBe('45,5–60')
    configureNumberLocale({ locale: 'en-US' })
    expect(numericRange([45.5, 60])).toBe('45.5–60')
  })
})

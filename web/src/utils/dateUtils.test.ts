import { describe, it, expect, vi, afterEach } from 'vitest'
import { todayStr, dayToInstant, instantToDay } from './dateUtils'

// Runs under TZ=America/New_York (set in the npm script) so these local<->UTC
// assertions are deterministic and exercise a real, DST-aware non-UTC offset.

describe('dayToInstant', () => {
  it('defaults to local noon, expressed in UTC', () => {
    expect(dayToInstant('2026-06-15')).toBe('2026-06-15T16:00:00.000Z')
  })

  it('round-trips through instantToDay', () => {
    expect(instantToDay(dayToInstant('2026-01-31'))).toBe('2026-01-31')
    expect(instantToDay(dayToInstant('2026-11-01'))).toBe('2026-11-01')
  })

  // The bug this replaced: `new Date('2026-06-15')` parses as UTC midnight, which is
  // the previous evening for anyone west of UTC, so the entry landed a day early.
  it('never lands on the previous day west of UTC', () => {
    expect(instantToDay(dayToInstant('2026-06-15'))).toBe('2026-06-15')
  })

  it('keeps the original time-of-day when moving an existing entry', () => {
    const original = new Date(2026, 5, 15, 18, 30, 0).toISOString()
    const moved = dayToInstant('2026-06-20', original)
    expect(instantToDay(moved)).toBe('2026-06-20')
    expect(new Date(moved).getHours()).toBe(18)
    expect(new Date(moved).getMinutes()).toBe(30)
  })

  it('falls back to noon when the previous timestamp is unusable', () => {
    expect(dayToInstant('2026-06-15', 'not-a-date')).toBe(dayToInstant('2026-06-15'))
  })
})

describe('instantToDay', () => {
  it('returns the local calendar day for an instant', () => {
    expect(instantToDay('2026-04-25T16:00:00.000Z')).toBe('2026-04-25')
  })

  it('maps a UTC-midnight instant to the previous local day (what noon-anchoring avoids)', () => {
    expect(instantToDay('2026-04-25T00:00:00.000Z')).toBe('2026-04-24')
  })

  it('round-trips with dayToInstant across the year', () => {
    for (const day of ['2026-01-15', '2026-04-25', '2026-07-04', '2026-12-31']) {
      expect(instantToDay(dayToInstant(day))).toBe(day)
    }
  })
})

describe('todayStr', () => {
  afterEach(() => vi.useRealTimers())

  it('returns the local calendar date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T16:00:00.000Z')) // noon EDT
    expect(todayStr()).toBe('2026-04-25')
  })

  it('reflects local time, not UTC, near midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T01:00:00.000Z')) // 21:00 EDT the prior day
    expect(todayStr()).toBe('2026-04-24')
  })
})

describe('todayStr — the date a form prefills', () => {
  // The mobile New Workout screen seeded its date with
  // `new Date().toISOString().slice(0, 10)`, the UTC day. West of UTC those differ
  // for the last hours of every evening, so the form offered tomorrow and the entry
  // was saved there. Suites run under America/New_York (see jest.config / the web
  // test script), so 23:00 local is already tomorrow in UTC.
  const at = (iso: string, fn: () => string) => {
    const RealDate = Date
    // @ts-expect-error — narrow stub, only the no-arg constructor is used here
    globalThis.Date = class extends RealDate {
      constructor(...args: unknown[]) {
        // @ts-expect-error — passthrough
        super(...(args.length ? args : [iso]))
      }
      static now() { return new RealDate(iso).getTime() }
    }
    try { return fn() } finally { globalThis.Date = RealDate }
  }

  it('returns the local day, not the UTC day, late in the evening', () => {
    // 2026-08-08T23:30 in New York is 2026-08-09T03:30Z.
    const local = at('2026-08-09T03:30:00.000Z', () => todayStr())
    expect(local).toBe('2026-08-08')
  })

  it('differs from the UTC slice the regression used', () => {
    const iso = '2026-08-09T03:30:00.000Z'
    const utcSlice = iso.slice(0, 10)
    const local = at(iso, () => todayStr())
    expect(utcSlice).toBe('2026-08-09')
    expect(local).not.toBe(utcSlice)
  })

  it('round-trips into an instant that stays on the same local day', () => {
    const local = at('2026-08-09T03:30:00.000Z', () => todayStr())
    expect(instantToDay(dayToInstant(local))).toBe(local)
  })
})

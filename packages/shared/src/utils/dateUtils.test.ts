import { todayStr, dayToInstant, instantToDay, entryDay, workoutDay } from './dateUtils'

const hours = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000


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

describe('todayStr', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
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

describe('entryDay — the server is the source of truth', () => {
  it('uses the stored day even when the device would derive another one', () => {
    // Filed on the 4th in New York (16:00Z). A device in Tokyo puts that instant on
    // the 5th. Before the day was stored, that re-derivation is what moved entries —
    // and on the edit screens it got saved back.
    expect(entryDay({ logged_on: '2026-08-04', logged_at: '2026-08-04T16:00:00.000Z' }))
      .toBe('2026-08-04')
  })

  it('falls back to the instant when the server sent no day', () => {
    // A response from a server older than the column. Suites run in America/New_York.
    expect(entryDay({ logged_at: '2026-08-04T16:00:00.000Z' })).toBe('2026-08-04')
  })

  it('treats an empty stored day as absent rather than as a day', () => {
    expect(entryDay({ logged_on: '', logged_at: '2026-08-04T16:00:00.000Z' })).toBe('2026-08-04')
  })
})

describe('workoutDay — recovered from the recorded offset', () => {
  it('applies the offset rather than the device zone', () => {
    // 16:00Z at -240 is noon on the 4th. Correct from any device, anywhere.
    expect(workoutDay({ started_at: '2026-08-04T16:00:00.000Z', tz_offset_minutes: -240 }))
      .toBe('2026-08-04')
  })

  it('keeps the day the workout happened on across the UTC boundary', () => {
    // 02:00Z on the 5th, logged at -240, was 22:00 on the 4th where it happened.
    expect(workoutDay({ started_at: '2026-08-05T02:00:00.000Z', tz_offset_minutes: -240 }))
      .toBe('2026-08-04')
  })

  it('handles a positive offset past midnight the other way', () => {
    // 16:00Z at +540 (Tokyo) is 01:00 on the 5th.
    expect(workoutDay({ started_at: '2026-08-04T16:00:00.000Z', tz_offset_minutes: 540 }))
      .toBe('2026-08-05')
  })

  it('supports a half-hour offset', () => {
    // Kathmandu, +5:45. 20:00Z on the 4th is 01:45 on the 5th.
    expect(workoutDay({ started_at: '2026-08-04T20:00:00.000Z', tz_offset_minutes: 345 }))
      .toBe('2026-08-05')
  })

  it('falls back to the device zone for a row written before the offset existed', () => {
    expect(workoutDay({ started_at: '2026-08-04T16:00:00.000Z' })).toBe('2026-08-04')
  })

  it('does not throw on an unparseable instant', () => {
    expect(() => workoutDay({ started_at: 'nonsense', tz_offset_minutes: -240 })).not.toThrow()
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { todayStr, dayToIsoNoon, isoToDayInput } from './dateUtils'

// Runs under TZ=America/New_York (set in the npm script) so these local<->UTC
// assertions are deterministic and exercise a real, DST-aware non-UTC offset.

describe('dayToIsoNoon', () => {
  it('anchors a calendar day at local noon, expressed in UTC (EDT, summer)', () => {
    // Noon EDT (UTC-4) = 16:00 UTC
    expect(dayToIsoNoon('2026-04-25')).toBe('2026-04-25T16:00:00.000Z')
  })

  it('accounts for daylight saving (EST, winter)', () => {
    // Noon EST (UTC-5) = 17:00 UTC
    expect(dayToIsoNoon('2026-01-15')).toBe('2026-01-15T17:00:00.000Z')
  })
})

describe('isoToDayInput', () => {
  it('returns the local calendar day for an instant', () => {
    expect(isoToDayInput('2026-04-25T16:00:00.000Z')).toBe('2026-04-25')
  })

  it('maps a UTC-midnight instant to the previous local day (what noon-anchoring avoids)', () => {
    expect(isoToDayInput('2026-04-25T00:00:00.000Z')).toBe('2026-04-24')
  })

  it('round-trips with dayToIsoNoon across the year', () => {
    for (const day of ['2026-01-15', '2026-04-25', '2026-07-04', '2026-12-31']) {
      expect(isoToDayInput(dayToIsoNoon(day))).toBe(day)
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

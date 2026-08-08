import { todayStr, dayToInstant, isoToDayInput } from './dateUtils'

const hours = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000


describe('dayToInstant', () => {
  it('defaults to local noon, expressed in UTC', () => {
    expect(dayToInstant('2026-06-15')).toBe('2026-06-15T16:00:00.000Z')
  })

  it('round-trips through isoToDayInput', () => {
    expect(isoToDayInput(dayToInstant('2026-01-31'))).toBe('2026-01-31')
    expect(isoToDayInput(dayToInstant('2026-11-01'))).toBe('2026-11-01')
  })

  // The bug this replaced: `new Date('2026-06-15')` parses as UTC midnight, which is
  // the previous evening for anyone west of UTC, so the entry landed a day early.
  it('never lands on the previous day west of UTC', () => {
    expect(isoToDayInput(dayToInstant('2026-06-15'))).toBe('2026-06-15')
  })

  it('keeps the original time-of-day when moving an existing entry', () => {
    const original = new Date(2026, 5, 15, 18, 30, 0).toISOString()
    const moved = dayToInstant('2026-06-20', original)
    expect(isoToDayInput(moved)).toBe('2026-06-20')
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

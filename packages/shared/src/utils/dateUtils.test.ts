import { todayStr, dayToIsoNoon, isoToDayInput, localDayRange } from './dateUtils'

const hours = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000

describe('localDayRange', () => {
  it('spans local midnight to next local midnight, expressed in UTC', () => {
    const { from, to } = localDayRange('2026-06-15')
    expect(from).toBe('2026-06-15T04:00:00.000Z')
    expect(to).toBe('2026-06-16T04:00:00.000Z')
    expect(hours(from, to)).toBe(24)
  })

  it('is contiguous with the next day', () => {
    expect(localDayRange('2026-06-15').to).toBe(localDayRange('2026-06-16').from)
  })

  it('covers a 23-hour spring-forward day', () => {
    const { from, to } = localDayRange('2026-03-08')
    expect(hours(from, to)).toBe(23)
  })

  it('covers a 25-hour fall-back day', () => {
    const { from, to } = localDayRange('2026-11-01')
    expect(hours(from, to)).toBe(25)
  })

  it('handles month and year boundaries', () => {
    expect(localDayRange('2026-12-31').to).toBe(localDayRange('2027-01-01').from)
  })
})

describe('dayToIsoNoon', () => {
  it('anchors at local noon expressed in UTC', () => {
    expect(dayToIsoNoon('2026-06-15')).toBe('2026-06-15T16:00:00.000Z')
  })

  it('round-trips through isoToDayInput', () => {
    expect(isoToDayInput(dayToIsoNoon('2026-01-31'))).toBe('2026-01-31')
    expect(isoToDayInput(dayToIsoNoon('2026-11-01'))).toBe('2026-11-01')
  })
})

describe('todayStr', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

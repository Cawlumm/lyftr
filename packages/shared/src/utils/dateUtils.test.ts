import { todayStr, dayToIsoNoon, isoToDayInput } from './dateUtils'

const hours = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000


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

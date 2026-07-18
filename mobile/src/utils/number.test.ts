import { clampStep, clampValue } from './number'

describe('clampStep', () => {
  it('steps by delta', () => {
    expect(clampStep(10, 2.5)).toBe(12.5)
  })

  it('rounds to 0.1 precision', () => {
    expect(clampStep(10, 2.567)).toBe(12.6)
  })

  it('clamps to the default min of 0 (the no-negatives guard)', () => {
    expect(clampStep(1, -5)).toBe(0)
  })

  it('clamps to an explicit max', () => {
    expect(clampStep(5, 10, { max: 12 })).toBe(12)
  })

  it('treats a non-finite base as 0', () => {
    expect(clampStep(NaN, 5)).toBe(5)
  })
})

describe('clampValue', () => {
  it('parses a numeric string', () => {
    expect(clampValue('12.3')).toBe(12.3)
  })

  it('falls back to min for a non-numeric string', () => {
    expect(clampValue('abc')).toBe(0)
  })

  it('clamps below the lower bound', () => {
    expect(clampValue(-4)).toBe(0)
    expect(clampValue('3', 5)).toBe(5)
  })
})

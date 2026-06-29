import { describe, it, expect } from 'vitest'
import { round1, displayWeight, displayVolume, weightError, isValidWeight, maxWeight } from './settings'

describe('round1', () => {
  it('rounds to one decimal place', () => {
    expect(round1(170)).toBe(170)
    expect(round1(170.34)).toBe(170.3)
    expect(round1(170.35)).toBe(170.4) // round-half-up
    expect(round1(170.04)).toBe(170)   // trailing .0 drops (170, not 170.0)
  })
})

describe('displayWeight', () => {
  it('returns lbs unchanged (to 0.1) when unit is lbs', () => {
    expect(displayWeight(170.3, 'lbs')).toBe(170.3)
    expect(displayWeight(170, 'lbs')).toBe(170)
  })

  it('converts lbs→kg and rounds to 0.1 (no floating-point noise)', () => {
    // 77 lbs / 2.20462 = 34.927… → 34.9
    expect(displayWeight(77, 'kg')).toBe(34.9)
    // 100 lbs / 2.20462 = 45.359… → 45.4
    expect(displayWeight(100, 'kg')).toBe(45.4)
  })

  it('preserves 0.1 precision that the old Math.round (integer) destroyed', () => {
    // Regression for #39: 170.3 lbs must not collapse to 170.
    expect(displayWeight(170.3, 'lbs')).not.toBe(170)
    expect(displayWeight(170.3, 'lbs')).toBe(170.3)
  })
})

describe('displayVolume', () => {
  it('always returns a whole number — volumes never want 0.1', () => {
    expect(displayVolume(12345.6, 'lbs')).toBe(12346)
    expect(Number.isInteger(displayVolume(9999.9, 'lbs'))).toBe(true)
    expect(Number.isInteger(displayVolume(5000, 'kg'))).toBe(true)
  })

  it('lbs passthrough (rounded to integer)', () => {
    expect(displayVolume(5000, 'lbs')).toBe(5000)
  })

  it('converts lbs→kg and rounds to a whole number', () => {
    // 5000 lbs / 2.20462 = 2267.96… → 2268
    expect(displayVolume(5000, 'kg')).toBe(2268)
  })
})

describe('weight validation (mirrors backend gt=0, lte=2000 lbs)', () => {
  it('rejects non-positive / non-finite', () => {
    expect(weightError(0, 'lbs')).toMatch(/valid/)
    expect(weightError(-5, 'lbs')).toMatch(/valid/)
    expect(weightError(NaN, 'lbs')).toMatch(/valid/)
    expect(isValidWeight(0, 'lbs')).toBe(false)
  })

  it('accepts a normal weight', () => {
    expect(weightError(175.3, 'lbs')).toBeNull()
    expect(isValidWeight(175.3, 'lbs')).toBe(true)
  })

  it('enforces the 2000 lb upper bound', () => {
    expect(weightError(2000, 'lbs')).toBeNull()          // at the bound
    expect(weightError(2001, 'lbs')).toMatch(/under 2000 lb/)
    expect(isValidWeight(2001, 'lbs')).toBe(false)
  })

  it('applies the bound unit-correctly in kg (2000 lb ≈ 907 kg)', () => {
    expect(maxWeight('kg')).toBe(907.2)
    expect(isValidWeight(907, 'kg')).toBe(true)          // 907 kg = 1999.6 lb
    expect(isValidWeight(910, 'kg')).toBe(false)         // 910 kg = 2006 lb
    expect(weightError(910, 'kg')).toMatch(/under 907 kg/)
  })
})

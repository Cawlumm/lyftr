import { describe, it, expect } from 'vitest'
import { isPositiveNumber } from './numberUtils'

describe('isPositiveNumber', () => {
  it('accepts strings that parse to a positive number', () => {
    expect(isPositiveNumber('5')).toBe(true)
    expect(isPositiveNumber('3.14')).toBe(true)
    expect(isPositiveNumber('  5  ')).toBe(true) // parseFloat tolerates surrounding space
  })

  it('rejects zero, negatives, empty and non-numeric input', () => {
    expect(isPositiveNumber('0')).toBe(false)
    expect(isPositiveNumber('-5')).toBe(false)
    expect(isPositiveNumber('')).toBe(false)
    expect(isPositiveNumber('abc')).toBe(false)
  })
})

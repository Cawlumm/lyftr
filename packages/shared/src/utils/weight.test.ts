import {
  displayWeight, displayToLbs, round1, weightError, isValidWeight, resolveWeightLbs, weightShort,
} from './weight'

describe('weight helpers', () => {
  it('shows lbs unchanged and converts kg', () => {
    expect(displayWeight(180, 'lbs')).toBe(180)
    expect(displayWeight(180, 'kg')).toBe(round1(180 / 2.20462)) // 81.6
  })

  it('round-trips display->lbs for kg approximately', () => {
    const kg = displayWeight(180, 'kg')
    expect(displayToLbs(kg, 'kg')).toBeCloseTo(180, 0)
  })

  it('validates bounds', () => {
    expect(weightError(0, 'lbs')).toBe('Enter a valid weight')
    expect(weightError(-5, 'lbs')).toBe('Enter a valid weight')
    expect(weightError(185, 'lbs')).toBeNull()
    expect(isValidWeight(185, 'lbs')).toBe(true)
    expect(weightError(3000, 'lbs')).toContain(weightShort('lbs'))
    expect(isValidWeight(3000, 'lbs')).toBe(false)
  })

  it('resolveWeightLbs keeps original lbs when the shown value is unchanged (no kg drift)', () => {
    const originalLbs = 180
    const shown = String(displayWeight(originalLbs, 'kg')) // "81.6"
    expect(resolveWeightLbs(shown, originalLbs, 'kg')).toBe(originalLbs)
    // but a real edit converts
    expect(resolveWeightLbs('82', originalLbs, 'kg')).toBeCloseTo(82 * 2.20462, 5)
  })
})

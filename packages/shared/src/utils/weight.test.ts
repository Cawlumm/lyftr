import {
  displayWeight, displayToLbs, round1, weightError, isValidWeight, resolveWeightLbs, weightShort, displayVolume, maxWeight,
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

// These three blocks came across from web/src/stores/settings.test.ts when the weight
// helpers moved into shared. Deleting that file without them would have dropped
// displayVolume's only coverage and the two regression guards below.
describe('displayVolume', () => {
  it('always returns a whole number — volumes never want a decimal', () => {
    expect(displayVolume(12345.6, 'lbs')).toBe(12346)
    expect(Number.isInteger(displayVolume(9999.9, 'lbs'))).toBe(true)
    expect(Number.isInteger(displayVolume(5000, 'kg'))).toBe(true)
  })

  it('passes lbs through, rounded to an integer', () => {
    expect(displayVolume(5000, 'lbs')).toBe(5000)
  })

  it('converts lbs→kg and rounds to a whole number', () => {
    expect(displayVolume(5000, 'kg')).toBe(2268)
  })
})

describe('displayWeight precision (#39)', () => {
  it('preserves the 0.1 precision the old integer rounding destroyed', () => {
    // A bodyweight step is 0.1, so rounding to an integer here would make the +/-
    // buttons appear to do nothing.
    expect(displayWeight(183.7, 'lbs')).toBe(183.7)
    expect(displayWeight(183.74, 'lbs')).toBe(183.7)
  })
})

describe('maxWeight', () => {
  it('applies the 2000 lb bound unit-correctly in kg', () => {
    expect(maxWeight('lbs')).toBe(2000)
    expect(maxWeight('kg')).toBe(907.2)
  })
})

import { describe, it, expect } from 'vitest'
import { BODYWEIGHT_STEP, PLATE_STEP, REP_STEP, clampStep, clampValue } from './number'

// The stepping math behind every +/- button in the app. It used to be covered only
// through WeightInput's buttons; those moved to StepperTile (#91), so it's tested
// directly here instead of through whichever component happens to render it.
describe('clampStep', () => {
  it('steps by delta', () => {
    expect(clampStep(100, 2.5)).toBe(102.5)
    expect(clampStep(100, -2.5)).toBe(97.5)
  })

  it('keeps repeated tenths exact — no float dust', () => {
    // 183.6 + 0.1 is 183.70000000000002 in raw IEEE754.
    const up = clampStep(183.6, 0.1)
    expect(up).toBe(183.7)
    expect(clampStep(up, -0.1)).toBe(183.6)
  })

  it('never goes below min, which defaults to 0', () => {
    expect(clampStep(0, -0.1)).toBe(0)
    expect(clampStep(0.05, -1)).toBe(0)
    expect(clampStep(10, -1, { min: 5 })).toBe(9)
    expect(clampStep(5, -1, { min: 5 })).toBe(5)
  })

  it('never goes above max', () => {
    expect(clampStep(999, 2.5, { max: 1000 })).toBe(1000)
    expect(clampStep(100, 2.5, { max: 1000 })).toBe(102.5)
  })

  it('treats a non-finite base as 0 — an empty field steps up from nothing', () => {
    expect(clampStep(NaN, 0.1)).toBe(0.1)
    expect(clampStep(Infinity, 0.1)).toBe(0.1)
  })
})

describe('stepper increments', () => {
  // Locks the three apart. They answer different questions (a body's daily drift, a
  // barbell's smallest plate pair, whole reps) and collapsing any two would silently
  // change what a button does on a screen nobody was looking at.
  it('are distinct, and bodyweight is the finest', () => {
    expect(BODYWEIGHT_STEP).toBe(0.1)
    expect(PLATE_STEP).toBe(2.5)
    expect(REP_STEP).toBe(1)
    expect(new Set([BODYWEIGHT_STEP, PLATE_STEP, REP_STEP]).size).toBe(3)
  })

  it('bodyweight is as fine as clampStep can express', () => {
    expect(clampStep(100, BODYWEIGHT_STEP)).toBe(100.1)
    // Half a step vanishes: clampStep rounds to 1dp, and 100.05 lands just under the
    // midpoint in IEEE754 so toFixed(1) takes it back to 100. A step finer than
    // BODYWEIGHT_STEP would be a button that does nothing — hence the floor.
    expect(clampStep(100, BODYWEIGHT_STEP / 2)).toBe(100)
  })
})

describe('clampValue', () => {
  it('parses strings and numbers, flooring at min', () => {
    expect(clampValue('170.3')).toBe(170.3)
    expect(clampValue(170.3)).toBe(170.3)
    expect(clampValue('-5')).toBe(0)
    expect(clampValue('-5', 1)).toBe(1)
  })

  it('falls back to min on junk', () => {
    expect(clampValue('')).toBe(0)
    expect(clampValue('abc')).toBe(0)
    expect(clampValue('abc', 5)).toBe(5)
  })
})

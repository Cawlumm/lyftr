import { describe, it, expect } from 'vitest'
import { calculateTUT, calculateActualRest } from './trainingMetrics'

describe('calculateTUT', () => {
  it('calculates standard tempo correctly', () => {
    // 4 + 1 + 2 + 1 = 8, 10 reps = 80
    expect(calculateTUT(10, '4-1-2-1', 0)).toBe(80)
  })

  it('calculates tempo with isohold correctly', () => {
    // 4 + 1 + 2 + 1 = 8, 10 reps = 80 + 5 sec isohold = 85
    expect(calculateTUT(10, '4-1-2-1', 5)).toBe(85)
  })

  it('handles empty or invalid tempo strings', () => {
    expect(calculateTUT(10, '', 0)).toBe(0)
    expect(calculateTUT(10, 'invalid', 0)).toBe(0)
  })

  it('handles 0 reps', () => {
    expect(calculateTUT(0, '4-1-2-1', 5)).toBe(0)
  })
})

describe('calculateActualRest', () => {
  it('calculates actual rest time by subtracting TUT from elapsed time', () => {
    const time1 = '2026-07-13T19:15:00Z' // Set 1 completed
    const time2 = '2026-07-13T19:17:35Z' // Set 2 completed (155s elapsed)
    const currentSetTUT = 80             // Set 2 took 80s of actual lifting
    
    // Actual rest = 155 - 80 = 75
    expect(calculateActualRest(time1, time2, currentSetTUT)).toBe(75)
  })

  it('returns 0 if elapsed time is less than TUT', () => {
    const time1 = '2026-07-13T19:15:00Z' 
    const time2 = '2026-07-13T19:16:00Z' // 60s elapsed
    const currentSetTUT = 80             // but TUT was 80s? 
    
    expect(calculateActualRest(time1, time2, currentSetTUT)).toBe(0)
  })

  it('returns 0 for missing timestamps', () => {
    expect(calculateActualRest(null, '2026-07-13T19:17:35Z', 80)).toBe(0)
    expect(calculateActualRest('2026-07-13T19:17:35Z', undefined, 80)).toBe(0)
  })
})

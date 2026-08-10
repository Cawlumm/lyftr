import { fmtClock, nextIncompleteSet } from './workoutSets'

describe('fmtClock', () => {
  it('formats seconds as m:ss with zero-padding', () => {
    expect(fmtClock(90)).toBe('1:30')
    expect(fmtClock(5)).toBe('0:05')
    expect(fmtClock(600)).toBe('10:00')
    expect(fmtClock(0)).toBe('0:00')
  })
})

describe('nextIncompleteSet', () => {
  it('returns the first not-completed set after the given index', () => {
    const sets = [{ completed: true }, { completed: false }, { completed: false }]
    expect(nextIncompleteSet(sets, 0)).toBe(1)
  })

  it('returns -1 when every set after the index is completed', () => {
    expect(nextIncompleteSet([{ completed: false }, { completed: true }], 0)).toBe(-1)
  })

  it('returns -1 for an empty list', () => {
    expect(nextIncompleteSet([], 0)).toBe(-1)
  })
})

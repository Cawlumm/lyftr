import { renderHook } from '@testing-library/react-native'
import { useMotion } from './useMotion'
import { DURATION, motionFor } from '../theme/motion'

let mockReduced = false
jest.mock('react-native-reanimated', () => ({
  Easing: { out: (f: unknown) => f, in: (f: unknown) => f, inOut: (f: unknown) => f, cubic: 'cubic', quad: 'quad', ease: 'ease', linear: 'linear' },
  useReducedMotion: () => mockReduced,
}))

describe('motionFor', () => {
  it('passes durations through when motion is allowed', () => {
    const m = motionFor(false)
    expect(m.duration(200)).toBe(200)
    expect([m.fast, m.base, m.slow]).toEqual([DURATION.fast, DURATION.base, DURATION.slow])
  })

  it('returns zero durations when reduced', () => {
    const m = motionFor(true)
    expect(m.reduced).toBe(true)
    expect(m.duration(200)).toBe(0)
    expect([m.fast, m.base, m.slow]).toEqual([0, 0, 0])
  })

  it('keeps every UI token inside 120-250ms', () => {
    for (const ms of Object.values(DURATION)) {
      expect(ms).toBeGreaterThanOrEqual(120)
      expect(ms).toBeLessThanOrEqual(250)
    }
  })
})

describe('useMotion (native)', () => {
  it('follows the OS reduce-motion setting', async () => {
    mockReduced = true
    expect((await renderHook(() => useMotion())).result.current.duration(180)).toBe(0)
    mockReduced = false
    expect((await renderHook(() => useMotion())).result.current.duration(180)).toBe(180)
  })
})

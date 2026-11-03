import { renderHook, act } from '@testing-library/react-native'
import { useCountdown } from '@lyftr/shared'

// The hook lives in @lyftr/shared, whose plain-node jest has no React renderer; the suite
// runs here, where @testing-library/react-native provides one.

describe('useCountdown', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('returns null when endsAt is null', async () => {
    const { result } = await renderHook(() => useCountdown(null))
    expect(result.current).toBeNull()
  })

  it('counts down to 0 and fires onComplete exactly once', async () => {
    const onComplete = jest.fn()
    const endsAt = Date.now() + 2000
    const { result } = await renderHook(() => useCountdown(endsAt, onComplete))

    expect(result.current).toBe(2)
    await act(async () => jest.advanceTimersByTime(1500)) // ~1.5s elapsed → 0.5s left → ceil = 1
    expect(result.current).toBe(1)
    await act(async () => jest.advanceTimersByTime(1500)) // ~3s elapsed → past end → 0
    expect(result.current).toBe(0)
    // keep ticking past zero — value stays clamped, no extra onComplete
    await act(async () => jest.advanceTimersByTime(3000))
    expect(result.current).toBe(0)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('never returns a negative value', async () => {
    const { result } = await renderHook(() => useCountdown(Date.now() - 5000))
    expect(result.current).toBe(0)
  })
})

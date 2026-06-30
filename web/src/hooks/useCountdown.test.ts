import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from './useCountdown'

describe('useCountdown', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns null when endsAt is null', () => {
    const { result } = renderHook(() => useCountdown(null))
    expect(result.current).toBeNull()
  })

  it('counts down to 0 and fires onComplete exactly once', () => {
    const onComplete = vi.fn()
    const endsAt = Date.now() + 2000
    const { result } = renderHook(() => useCountdown(endsAt, onComplete))

    expect(result.current).toBe(2)
    act(() => vi.advanceTimersByTime(1500)) // ~1.5s elapsed → 0.5s left → ceil = 1
    expect(result.current).toBe(1)
    act(() => vi.advanceTimersByTime(1500)) // ~3s elapsed → past end → 0
    expect(result.current).toBe(0)
    // keep ticking past zero — value stays clamped, no extra onComplete
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current).toBe(0)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('never returns a negative value', () => {
    const { result } = renderHook(() => useCountdown(Date.now() - 5000))
    expect(result.current).toBe(0)
  })
})

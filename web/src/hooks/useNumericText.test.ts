import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNumericText } from './useNumericText'

// Regression guard for the gym weight/reps in-progress-typing bug fixed in PR #59:
// the parent re-derives `value` from a rounded / 0→'' number on every keystroke, and
// must NOT clobber what the user is mid-typing (a trailing ".", a leading "0"), while
// still re-syncing for genuinely different numbers (stepper / programmatic changes).
describe('useNumericText', () => {
  it('initializes to the given value', () => {
    const { result } = renderHook(() => useNumericText('90'))
    expect(result.current[0]).toBe('90')
  })

  it('preserves an in-progress "2." when the parent re-derives an equal number', () => {
    const { result, rerender } = renderHook(({ v }) => useNumericText(v), { initialProps: { v: '2' } })
    act(() => result.current[1]('2.')) // user typed a trailing dot
    rerender({ v: '2.0' }) // parent re-derived; 2.0 is numerically equal to 2.
    expect(result.current[0]).toBe('2.')
  })

  it('preserves a leading "0" even when the parent maps 0 → ""', () => {
    const { result, rerender } = renderHook(({ v }) => useNumericText(v), { initialProps: { v: '5' } })
    act(() => result.current[1]('0')) // user cleared and typed "0"
    rerender({ v: '' }) // parent stored 0 and maps it to ''
    expect(result.current[0]).toBe('0')
  })

  it('re-syncs when the parent value is a genuinely different number', () => {
    const { result, rerender } = renderHook(({ v }) => useNumericText(v), { initialProps: { v: '90' } })
    rerender({ v: '95' }) // stepper / programmatic change
    expect(result.current[0]).toBe('95')
  })
})

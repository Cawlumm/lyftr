import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFoodAmount } from '@lyftr/shared'

// The hook lives in @lyftr/shared; the suite is here because it needs jsdom and
// @testing-library, which shared's plain-node jest does not carry (see useFavorites).

const OIL = { serving_quantity: 100, serving_unit: 'ml' as const }   // figures per 100 ml
const TBSP = { serving_quantity: 15, serving_unit: 'ml' as const }   // a real pack serving
const UNKNOWN = { serving_quantity: 0, serving_unit: '' as const }   // hand-entered food

describe('useFoodAmount', () => {
  it('counts the unit a serving is measured in, when one is known', () => {
    const { result } = renderHook(() => useFoodAmount(OIL))
    act(() => result.current.openOn(OIL))

    expect(result.current.basis).toEqual({ quantity: 100, unit: 'ml' })
    expect(result.current.text).toBe('100')

    act(() => result.current.setText('15'))
    expect(result.current.servings).toBeCloseTo(0.15)
    expect(result.current.servingsLabel).toBe(0.15)
  })

  // The bug: the field floored at 0.5 servings, so the least anyone could log of an oil
  // held per 100 ml was 50 ml. A tablespoon was unreachable (#171).
  it('has no minimum', () => {
    const { result } = renderHook(() => useFoodAmount(OIL))
    act(() => result.current.setText('0.4'))
    expect(result.current.servings).toBeCloseTo(0.004)
    expect(result.current.servingsLabel).toBe(0.004)
  })

  // No minimum, but a maximum: 999999 in the field read 7,999,992 kcal against the day.
  it('refuses more than one entry can hold, and says the limit in the unit shown', () => {
    const { result } = renderHook(() => useFoodAmount(OIL))

    act(() => result.current.setText('999999'))
    expect(result.current.overLimit).toBe(true)
    // OIL is held per 100 ml, so the ceiling reads as ten litres.
    expect(result.current.maxAmount).toBe('10000 ml')

    // The ceiling itself is allowed, so the two sides cannot be out of step by one.
    act(() => result.current.setText('10000'))
    expect(result.current.servings).toBe(100)
    expect(result.current.overLimit).toBe(false)
  })

  it('counts servings when nothing knows what one measures', () => {
    const { result } = renderHook(() => useFoodAmount(UNKNOWN))
    act(() => result.current.openOn(UNKNOWN))

    expect(result.current.basis).toBeNull()
    expect(result.current.text).toBe('1')
    act(() => result.current.setText('0.25'))
    expect(result.current.servings).toBe(0.25)
  })

  // An empty field is not zero food, it is no answer — the caller blocks the log on it.
  it.each(['', '.', 'abc', '-2', '0'])('is 0 servings for %o', (typed) => {
    const { result } = renderHook(() => useFoodAmount(OIL))
    act(() => result.current.setText(typed))
    expect(result.current.servings).toBe(0)
  })

  it('steps by one serving, in the field’s own unit, and stops at zero', () => {
    const { result } = renderHook(() => useFoodAmount(TBSP))
    act(() => result.current.openOn(TBSP))
    act(() => result.current.step(1))
    expect(result.current.text).toBe('30')
    act(() => result.current.step(-1))
    act(() => result.current.step(-1))
    expect(result.current.text).toBe('0')
    // Not negative: there is no such amount of food.
    act(() => result.current.step(-1))
    expect(result.current.text).toBe('0')
  })

  it('steps by half a serving when that is all the field counts', () => {
    const { result } = renderHook(() => useFoodAmount(UNKNOWN))
    act(() => result.current.step(1))
    expect(result.current.text).toBe('1.5')
  })

  // Re-opening an entry has to show what was logged, not one serving of it.
  it('opens an existing entry on the amount it recorded', () => {
    const { result } = renderHook(() => useFoodAmount(OIL))
    act(() => result.current.openOnEntry(OIL, 0.15))
    expect(result.current.text).toBe('15')

    const plain = renderHook(() => useFoodAmount(UNKNOWN))
    act(() => plain.result.current.openOnEntry(UNKNOWN, 2.5))
    expect(plain.result.current.text).toBe('2.5')
  })
})

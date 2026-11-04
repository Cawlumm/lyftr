import { renderHook, act } from '@testing-library/react-native'
import { useFoodAmount } from '@lyftr/shared'

// The hook lives in @lyftr/shared, whose plain-node jest has no React renderer; the suite
// runs here, where @testing-library/react-native provides one.

const OIL = { serving_quantity: 100, serving_unit: 'ml' as const }   // figures per 100 ml
const TBSP = { serving_quantity: 15, serving_unit: 'ml' as const }   // a real pack serving
const UNKNOWN = { serving_quantity: 0, serving_unit: '' as const }   // hand-entered food

describe('useFoodAmount', () => {
  it('counts the unit a serving is measured in, when one is known', async () => {
    const { result } = await renderHook(() => useFoodAmount(OIL))
    await act(async () => result.current.openOn(OIL))

    expect(result.current.basis).toEqual({ quantity: 100, unit: 'ml' })
    expect(result.current.text).toBe('100')

    await act(async () => result.current.setText('15'))
    expect(result.current.servings).toBeCloseTo(0.15)
    expect(result.current.servingsLabel).toBe(0.15)
  })

  // The bug: the field floored at 0.5 servings, so the least anyone could log of an oil
  // held per 100 ml was 50 ml. A tablespoon was unreachable (#171).
  it('has no minimum', async () => {
    const { result } = await renderHook(() => useFoodAmount(OIL))
    await act(async () => result.current.setText('0.4'))
    expect(result.current.servings).toBeCloseTo(0.004)
    expect(result.current.servingsLabel).toBe(0.004)
  })

  // No minimum, but a maximum: 999999 in the field read 7,999,992 kcal against the day.
  // The field does not take it: the keystroke that would pass the ceiling is dropped.
  it('does not accept a keystroke past what one entry holds', async () => {
    const { result } = await renderHook(() => useFoodAmount(OIL))

    await act(async () => result.current.setText('1000'))
    await act(async () => result.current.setText('10000'))
    // The ceiling itself is allowed, so the two sides cannot be out of step by one.
    expect(result.current.text).toBe('10000')
    expect(result.current.servings).toBe(100)
    expect(result.current.overLimit).toBe(false)

    // For a field that holds its own copy of the text and has to refuse the key itself.
    let landed = true
    await act(async () => { landed = result.current.setText('100000') })
    expect(landed).toBe(false)
    expect(result.current.text).toBe('10000')
    await act(async () => { landed = result.current.setText('9999') })
    expect(landed).toBe(true)

    const plain = await renderHook(() => useFoodAmount(UNKNOWN))
    await act(async () => plain.result.current.setText('100'))
    await act(async () => plain.result.current.setText('1000'))
    expect(plain.result.current.text).toBe('100')
  })

  // Entries stored before the server enforced the ceiling can be over it. They open as
  // they were, say so, and can be lowered; they cannot be raised further.
  it('remembers a refusal until the next edit or step lands', async () => {
    const { result } = await renderHook(() => useFoodAmount(null))
    expect(result.current.limitHint).toBeNull()

    await act(async () => result.current.setText('999999'))
    expect(result.current.limitHint).toBe('One entry holds at most 100 servings')

    await act(async () => result.current.setText('50'))
    expect(result.current.limitHint).toBeNull()

    await act(async () => result.current.setText('999999'))
    await act(async () => result.current.step(-1))
    expect(result.current.limitHint).toBeNull()
  })

  // 3330 / 33.3 is 100.00000000000001 in floating point; the field must not take the
  // ceiling and then call it over the limit.
  it('takes the ceiling on a serving that does not divide evenly', async () => {
    const ODD = { serving_quantity: 33.3, serving_unit: 'g' as const }
    const { result } = await renderHook(() => useFoodAmount(ODD))
    await act(async () => result.current.setText('3330'))
    expect(result.current.text).toBe('3330')
    expect(result.current.servings).toBe(100)
    expect(result.current.overLimit).toBe(false)
  })

  it('still holds the ceiling when the field is not a number', async () => {
    const { result } = await renderHook(() => useFoodAmount(OIL))
    await act(async () => result.current.setText('.'))
    let landed = true
    await act(async () => { landed = result.current.setText('999999') })
    expect(landed).toBe(false)
    expect(result.current.text).toBe('.')
  })

  it('lets an entry stored over the limit be edited down but not up', async () => {
    const { result } = await renderHook(() => useFoodAmount(OIL))
    await act(async () => result.current.openOnEntry(OIL, 5000))
    expect(result.current.text).toBe('500000')
    expect(result.current.overLimit).toBe(true)
    // OIL is held per 100 ml, so the ceiling reads as ten litres.
    expect(result.current.limitHint).toBe('One entry holds at most 10000 ml')

    await act(async () => result.current.setText('5000000'))
    expect(result.current.text).toBe('500000')
    await act(async () => result.current.setText('50000'))
    expect(result.current.text).toBe('50000')
  })

  it('counts servings when nothing knows what one measures', async () => {
    const { result } = await renderHook(() => useFoodAmount(UNKNOWN))
    await act(async () => result.current.openOn(UNKNOWN))

    expect(result.current.basis).toBeNull()
    expect(result.current.text).toBe('1')
    await act(async () => result.current.setText('0.25'))
    expect(result.current.servings).toBe(0.25)
  })

  // An empty field is not zero food, it is no answer — the caller blocks the log on it.
  it.each(['', '.', 'abc', '-2', '0'])('is 0 servings for %o', async (typed) => {
    const { result } = await renderHook(() => useFoodAmount(OIL))
    await act(async () => result.current.setText(typed))
    expect(result.current.servings).toBe(0)
  })

  it('steps by one serving, in the field’s own unit, and stops at zero', async () => {
    const { result } = await renderHook(() => useFoodAmount(TBSP))
    await act(async () => result.current.openOn(TBSP))
    await act(async () => result.current.step(1))
    expect(result.current.text).toBe('30')
    await act(async () => result.current.step(-1))
    await act(async () => result.current.step(-1))
    expect(result.current.text).toBe('0')
    // Not negative: there is no such amount of food.
    await act(async () => result.current.step(-1))
    expect(result.current.text).toBe('0')
  })

  // Past the ceiling the Log button refuses, so the stepper stops there as it does at zero.
  it('stops stepping at the most one entry holds', async () => {
    const { result } = await renderHook(() => useFoodAmount(TBSP))
    await act(async () => result.current.setText('1485'))
    await act(async () => result.current.step(1))
    expect(result.current.text).toBe('1500')
    expect(result.current.overLimit).toBe(false)
    await act(async () => result.current.step(1))
    expect(result.current.text).toBe('1500')

    // From beyond it, a step up brings the field back to the ceiling rather than past it.
    await act(async () => result.current.openOnEntry(TBSP, 5000))
    await act(async () => result.current.step(1))
    expect(result.current.text).toBe('1500')

    // A step down lowers it by one serving from where it was, not down to the ceiling.
    await act(async () => result.current.openOnEntry(TBSP, 5000))
    await act(async () => result.current.step(-1))
    expect(result.current.text).toBe('74985')

    const plain = await renderHook(() => useFoodAmount(UNKNOWN))
    await act(async () => plain.result.current.setText('100'))
    await act(async () => plain.result.current.step(1))
    expect(plain.result.current.text).toBe('100')
  })

  it('steps by half a serving when that is all the field counts', async () => {
    const { result } = await renderHook(() => useFoodAmount(UNKNOWN))
    await act(async () => result.current.step(1))
    expect(result.current.text).toBe('1.5')
  })

  // Re-opening an entry has to show what was logged, not one serving of it.
  it('opens an existing entry on the amount it recorded', async () => {
    const { result } = await renderHook(() => useFoodAmount(OIL))
    await act(async () => result.current.openOnEntry(OIL, 0.15))
    expect(result.current.text).toBe('15')

    const plain = await renderHook(() => useFoodAmount(UNKNOWN))
    await act(async () => plain.result.current.openOnEntry(UNKNOWN, 2.5))
    expect(plain.result.current.text).toBe('2.5')
  })
})

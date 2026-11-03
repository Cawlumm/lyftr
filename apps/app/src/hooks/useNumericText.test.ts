import { renderHook, act } from '@testing-library/react-native'
import { useNumericText } from '@lyftr/shared'

// The hook lives in @lyftr/shared, whose plain-node jest has no React renderer; the suite
// runs here, where @testing-library/react-native provides one.

// Regression guard for the gym weight/reps in-progress-typing bug fixed in PR #59:
// the parent re-derives `value` from a rounded / 0→'' number on every keystroke, and
// must NOT clobber what the user is mid-typing (a trailing ".", a leading "0"), while
// still re-syncing for genuinely different numbers (stepper / programmatic changes).
describe('useNumericText', () => {
  it('initializes to the given value', async () => {
    const { result } = await renderHook(() => useNumericText('90'))
    expect(result.current[0]).toBe('90')
  })

  it('preserves an in-progress "2." when the parent re-derives an equal number', async () => {
    const { result, rerender } = await renderHook(({ v }: { v: string }) => useNumericText(v), { initialProps: { v: '2' } })
    await act(async () => result.current[1]('2.')) // user typed a trailing dot
    await rerender({ v: '2.0' }) // parent re-derived; 2.0 is numerically equal to 2.
    expect(result.current[0]).toBe('2.')
  })

  it('preserves a leading "0" even when the parent maps 0 → ""', async () => {
    const { result, rerender } = await renderHook(({ v }: { v: string }) => useNumericText(v), { initialProps: { v: '5' } })
    await act(async () => result.current[1]('0')) // user cleared and typed "0"
    await rerender({ v: '' }) // parent stored 0 and maps it to ''
    expect(result.current[0]).toBe('0')
  })

  it('re-syncs when the parent value is a genuinely different number (stepper/prefill)', async () => {
    const { result, rerender } = await renderHook(({ v }: { v: string }) => useNumericText(v), { initialProps: { v: '90' } })
    await rerender({ v: '95' }) // stepper / programmatic change / deferred prefill
    expect(result.current[0]).toBe('95')
  })

  it('populates a deferred prefill (empty → value), e.g. autofocus edit modals', async () => {
    const { result, rerender } = await renderHook(({ v }: { v: string }) => useNumericText(v), { initialProps: { v: '' } })
    await rerender({ v: '180' }) // parent effect prefills after mount
    expect(result.current[0]).toBe('180')
  })
})

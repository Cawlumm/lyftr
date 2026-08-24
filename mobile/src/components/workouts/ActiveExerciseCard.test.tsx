import { renderHook, act } from '@testing-library/react-native'
import { useNumericText } from '@lyftr/shared'

// Regression guard for the defect review found in #146: sanitizeNumericInput was wired
// into ActiveExerciseCard, but the weight field had no useNumericText buffer. Its `value`
// is re-derived from a *number* in the session store on every keystroke, so typing "12."
// stored Number("12.") === 12, re-rendered as "12", and RN pushed that back into the
// native field — deleting the separator before the fractional digit could be typed.
//
// Net effect: #141 was declared fixed while the List view, which is the *default* workout
// layout (`workout_layout ?? 'list'`), still could not accept 12,5 or 12.5 at all.
//
// The helper's own rules live in packages/shared number.test.ts. What is worth pinning
// here is the part that was actually missing: the buffer has to survive a parent that
// round-trips the value through Number(). Rendering the whole card would need the theme,
// router and session store mocked to assert the same one thing.
describe('ActiveExerciseCard weight entry', () => {
  it('keeps a trailing separator when the parent re-derives value through Number()', () => {
    const { result, rerender } = renderHook((v: string) => useNumericText(v), {
      initialProps: '',
    })

    act(() => result.current[1]('12.'))
    expect(result.current[0]).toBe('12.')

    // Exactly what the card does: Number('12.') is 12, stored, handed back as '12'.
    rerender(String(Number('12.')))

    // Without the buffer this reads '12' and the fraction is unreachable.
    expect(result.current[0]).toBe('12.')

    act(() => result.current[1]('12.5'))
    expect(result.current[0]).toBe('12.5')
  })

  it('still follows the parent when the weight genuinely changes elsewhere', () => {
    const { result, rerender } = renderHook((v: string) => useNumericText(v), {
      initialProps: '100',
    })
    rerender('102.5')
    expect(result.current[0]).toBe('102.5')
  })
})

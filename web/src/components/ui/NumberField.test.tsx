import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NumberField from './NumberField'

// The web counterpart of mobile's NumericInput tests. The two platforms defend the same
// rule from opposite ends: React Native hands over whatever was typed and the app filters
// it, while the browser filters first and hands over "" for anything that is not a valid
// floating-point number. So what is worth pinning here is not a truth table — it is the
// three browser-specific decisions this component makes, each of which fails quietly.
describe('web NumberField', () => {
  const field = (props: Partial<React.ComponentProps<typeof NumberField>> = {}) => {
    const onChange = vi.fn()
    render(<NumberField value="" onChange={onChange} aria-label="Weight" {...props} />)
    return { input: screen.getByLabelText(props['aria-label'] ?? 'Weight') as HTMLInputElement, onChange }
  }

  // step=1 is the <input type="number"> default, and the browser treats anything off that
  // grid as invalid — it refuses to submit and offers "the two nearest valid values are
  // 183 and 184". A decimal field that forgot this would reject every weight the app is
  // built to store (#39), and only on submit, far from the field that caused it.
  it('spells out 0.1 precision for decimals and keeps the integer grid for reps', () => {
    expect(field({ inputMode: 'decimal' }).input.step).toBe('0.1')
    expect(field({ inputMode: 'numeric', 'aria-label': 'Reps' }).input.step).toBe('1')
  })

  // keydown is the only place these can be stopped: they are legal in a number field, so
  // the browser would otherwise accept "1e3" as 1000 and "-5" as a negative bodyweight.
  it('blocks the keys that make a number field accept a non-weight', () => {
    const { input } = field({ inputMode: 'decimal' })
    for (const key of ['e', 'E', '+', '-']) {
      expect(fireEvent.keyDown(input, { key })).toBe(false) // false = preventDefault was called
    }
    expect(fireEvent.keyDown(input, { key: '.' })).toBe(true) // a decimal field needs its separator
    expect(fireEvent.keyDown(input, { key: '5' })).toBe(true)
  })

  it('also blocks the separator on an integer field, so reps cannot go fractional', () => {
    const { input } = field({ inputMode: 'numeric', 'aria-label': 'Reps' })
    expect(fireEvent.keyDown(input, { key: '.' })).toBe(false)
    expect(fireEvent.keyDown(input, { key: '5' })).toBe(true)
  })

  // keydown cannot see a paste, so the same guard has to exist on the value itself.
  // Verified against real Chrome: pasting "-5" arrives already normalised to "5", but the
  // strip is what makes that true in every engine rather than by luck.
  it('strips a minus that arrives by paste rather than by keystroke', () => {
    const { input, onChange } = field()
    fireEvent.change(input, { target: { value: '-45' } })
    expect(onChange).toHaveBeenCalledWith('45')
  })

  // Same contract as mobile's NumericInput, reached a different way: mid-separator the
  // browser reports "", and the component must pass that on rather than invent a number.
  it('passes a half-typed decimal through as empty, not as the truncated number', () => {
    const { input, onChange } = field({ inputMode: 'decimal' })
    fireEvent.change(input, { target: { value: '12' } })
    expect(onChange).toHaveBeenLastCalledWith('12')
    fireEvent.change(input, { target: { value: '12.' } })
    expect(onChange).toHaveBeenLastCalledWith('')
    fireEvent.change(input, { target: { value: '12.5' } })
    expect(onChange).toHaveBeenLastCalledWith('12.5')
  })
})

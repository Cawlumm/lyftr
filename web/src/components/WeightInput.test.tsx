import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WeightInput from './WeightInput'

// WeightInput is the bare sets-table field now; the +/- buttons it used to carry
// live in StepperTile (see StepperTile.test.tsx for the button wiring and
// number.test.ts for the stepping math).
describe('WeightInput', () => {
  it('renders a bare field — no +/- buttons', () => {
    render(<WeightInput value="100" onChange={() => {}} unit="lbs" />)
    expect(screen.queryByLabelText(/decrease/i)).toBeNull()
    expect(screen.queryByLabelText(/increase/i)).toBeNull()
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('100')
  })

  it('passes the typed value straight through as a string (caller owns conversion)', () => {
    const onChange = vi.fn()
    render(<WeightInput value="" onChange={onChange} unit="lbs" />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '170.3' } })
    expect(onChange).toHaveBeenCalledWith('170.3')
  })

  it('strips a typed minus — weights are never negative', () => {
    const onChange = vi.fn()
    render(<WeightInput value="" onChange={onChange} unit="lbs" />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-45' } })
    expect(onChange).toHaveBeenCalledWith('45')
  })

  // Web's own version of #141, and it fails in the opposite direction to mobile's.
  // React Native hands over whatever was typed and the app must filter it; the browser
  // filters first and hands over NOTHING — `.value` on an <input type="number"> is the
  // empty string for anything that is not a valid floating-point number, and "12." is
  // not one. So the separator keystroke arrives as a wipe.
  //
  // What makes that survivable is that the browser keeps the text on screen, so the next
  // digit arrives as the whole "12.5" and the value reappears. Verified against real
  // Chrome, which agrees with jsdom here — the keystroke sequence below is exactly what
  // was driven through a live page.
  //
  // The part that must not regress is the gap in between: mid-separator the field is
  // empty rather than 12, so nothing downstream may treat it as a committed number. On
  // the Weight page that is what keeps "Log Weight" disabled until the decimal is
  // finished, instead of quietly logging 12.
  it('reports a half-typed decimal as empty, never as the truncated number', () => {
    const onChange = vi.fn()
    render(<WeightInput value="" onChange={onChange} unit="lbs" />)
    const input = screen.getByRole('spinbutton')

    fireEvent.change(input, { target: { value: '12' } })
    expect(onChange).toHaveBeenLastCalledWith('12')

    fireEvent.change(input, { target: { value: '12.' } })
    expect(onChange).toHaveBeenLastCalledWith('') // NOT '12' — a truncated 12 would be a silent 10x

    fireEvent.change(input, { target: { value: '12.5' } })
    expect(onChange).toHaveBeenLastCalledWith('12.5')
  })

  it('shows the unit suffix', () => {
    render(<WeightInput value="100" onChange={() => {}} unit="kg" />)
    expect(screen.getByText('kg')).toBeTruthy()
  })

  it('accepts 0.1 typing precision (#39)', () => {
    render(<WeightInput value="100" onChange={() => {}} unit="lbs" />)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).step).toBe('0.1')
  })

  it('disabled disables the field', () => {
    render(<WeightInput value="100" onChange={() => {}} unit="lbs" disabled />)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true)
  })
})

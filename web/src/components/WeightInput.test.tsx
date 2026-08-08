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

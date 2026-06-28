import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WeightInput from './WeightInput'

describe('WeightInput', () => {
  it('stepper=false renders a bare field with no +/- buttons', () => {
    render(<WeightInput value="100" onChange={() => {}} unit="lbs" stepper={false} />)
    expect(screen.queryByLabelText(/decrease/i)).toBeNull()
    expect(screen.queryByLabelText(/increase/i)).toBeNull()
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('100')
  })

  it('renders +/- buttons by default (stepper mode)', () => {
    render(<WeightInput value="100" onChange={() => {}} unit="lbs" />)
    expect(screen.getByLabelText(/decrease/i)).toBeTruthy()
    expect(screen.getByLabelText(/increase/i)).toBeTruthy()
  })

  it('+ adjusts by step and emits a string', () => {
    const onChange = vi.fn()
    render(<WeightInput value="100" onChange={onChange} unit="lbs" step={0.1} />)
    fireEvent.click(screen.getByLabelText(/increase/i))
    expect(onChange).toHaveBeenCalledWith('100.1')
  })

  it('clamps at 0 — never goes negative', () => {
    const onChange = vi.fn()
    render(<WeightInput value="0" onChange={onChange} unit="lbs" step={0.1} />)
    fireEvent.click(screen.getByLabelText(/decrease/i))
    expect(onChange).toHaveBeenCalledWith('0')
  })

  it('passes the typed value straight through as a string (caller owns conversion)', () => {
    const onChange = vi.fn()
    render(<WeightInput value="" onChange={onChange} unit="lbs" stepper={false} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '170.3' } })
    expect(onChange).toHaveBeenCalledWith('170.3')
  })

  it('shows the unit suffix', () => {
    render(<WeightInput value="100" onChange={() => {}} unit="kg" stepper={false} />)
    expect(screen.getByText('kg')).toBeTruthy()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Scale } from 'lucide-react'
import StepperTile from './StepperTile'
import NumberField from './NumberField'

// The +/- half of every prominent numeric input: bodyweight (#91) and gym mode both
// render through here, so the button wiring is tested once rather than per screen.
const renderTile = (props: Partial<React.ComponentProps<typeof StepperTile>> = {}) => {
  const onStep = vi.fn()
  render(
    <StepperTile icon={Scale} label="Weight (lbs)" name="weight" step={0.1} onStep={onStep} {...props}>
      <NumberField value="183.6" onChange={() => {}} aria-label="Weight" />
    </StepperTile>,
  )
  return onStep
}

describe('StepperTile', () => {
  it('renders the label and the value field between the two buttons', () => {
    renderTile()
    expect(screen.getByText('Weight (lbs)')).toBeTruthy()
    expect((screen.getByLabelText('Weight') as HTMLInputElement).value).toBe('183.6')
    expect(screen.getByLabelText(/decrease/i)).toBeTruthy()
    expect(screen.getByLabelText(/increase/i)).toBeTruthy()
  })

  it('reports the step signed by direction — the caller owns the arithmetic', () => {
    const onStep = renderTile()
    fireEvent.click(screen.getByLabelText(/increase/i))
    expect(onStep).toHaveBeenCalledWith(0.1)
    fireEvent.click(screen.getByLabelText(/decrease/i))
    expect(onStep).toHaveBeenLastCalledWith(-0.1)
  })

  // 2.5, not the 0.1 above: a step equal to the other case's would pass whether or
  // not the prop is read at all.
  it('honours a coarser step', () => {
    const onStep = renderTile({ step: 2.5, name: 'weight' })
    fireEvent.click(screen.getByLabelText(/increase/i))
    expect(onStep).toHaveBeenCalledWith(2.5)
  })

  it('names the metric in both button labels, for screen readers', () => {
    renderTile({ name: 'reps' })
    expect(screen.getByLabelText('Increase reps')).toBeTruthy()
    expect(screen.getByLabelText('Decrease reps')).toBeTruthy()
  })

  // Regression: NumberField shipped without a step attribute, so type=number fell
  // back to step=1 and the browser rejected every tenth — "the two nearest valid
  // values are 183 and 184" — blocking submit before any request was made (#91).
  it('a decimal field accepts tenths, so the browser does not reject them', () => {
    renderTile()
    expect((screen.getByLabelText('Weight') as HTMLInputElement).step).toBe('0.1')
  })

  it('an integer field keeps whole-number steps', () => {
    render(
      <StepperTile icon={Scale} label="Reps" name="reps" step={1} onStep={() => {}}>
        <NumberField value="8" inputMode="numeric" onChange={() => {}} aria-label="Reps" />
      </StepperTile>,
    )
    expect((screen.getByLabelText('Reps') as HTMLInputElement).step).toBe('1')
  })

  it('disabled disables both buttons and the field', () => {
    renderTile({ disabled: true })
    expect((screen.getByLabelText(/decrease/i) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText(/increase/i) as HTMLButtonElement).disabled).toBe(true)
  })
})

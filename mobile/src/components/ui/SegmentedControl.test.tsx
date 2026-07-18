import { fireEvent, render, screen } from '@testing-library/react-native'
import { SegmentedControl } from './SegmentedControl'

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const

describe('SegmentedControl', () => {
  it('renders every option label', () => {
    render(<SegmentedControl options={options} value="a" onChange={() => {}} />)
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
  })

  it('fires onChange with the value when an inactive option is pressed', () => {
    const onChange = jest.fn()
    render(<SegmentedControl options={options} value="a" onChange={onChange} />)
    fireEvent.press(screen.getByText('Beta'))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('does not fire onChange when the already-active option is pressed', () => {
    const onChange = jest.fn()
    render(<SegmentedControl options={options} value="a" onChange={onChange} />)
    fireEvent.press(screen.getByText('Alpha'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

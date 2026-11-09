import { fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { SupersetJoint } from './SupersetJoint'
import { SupersetMarker, SupersetRail } from './SupersetMarker'
import { TOUCH_MIN } from '../ui/interaction'

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

describe('SupersetJoint (en)', () => {
  it('offers to link when unlinked, and toggles on press', async () => {
    const onToggle = jest.fn()
    await render(<SupersetJoint linked={false} aName="Bench" bName="Row" onToggle={onToggle} />)
    fireEvent.press(screen.getByLabelText('Superset Bench with Row'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('offers to unlink when linked', async () => {
    await render(<SupersetJoint linked aName="Bench" bName="Row" onToggle={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Unlink Bench from Row' })).toBeTruthy()
  })

  it('does not fire when disabled', async () => {
    const onToggle = jest.fn()
    await render(<SupersetJoint linked={false} aName="A" bName="B" onToggle={onToggle} disabled />)
    fireEvent.press(screen.getByLabelText('Superset A with B'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  // aria-selected is not allowed on role=button; axe fails every page that renders one.
  it('carries no selected state, since the label already names the action', async () => {
    await render(<SupersetJoint linked aName="A" bName="B" onToggle={jest.fn()} />)
    expect(screen.getByLabelText('Unlink A from B').props.accessibilityState?.selected).toBeUndefined()
  })

  it('pads the pressable out to 44x44', async () => {
    await render(<SupersetJoint linked={false} aName="A" bName="B" onToggle={jest.fn()} />)
    const style = screen.getByLabelText('Superset A with B').props.style
    const flat = Object.assign({}, ...[style].flat(3).filter(Boolean))
    expect(32 + 2 * flat.paddingHorizontal).toBeGreaterThanOrEqual(TOUCH_MIN)
    expect(32 + 2 * flat.paddingVertical).toBeGreaterThanOrEqual(TOUCH_MIN)
  })
})

describe('SupersetMarker (en)', () => {
  it('compact shows the letter and position and names the position for screen readers', async () => {
    await render(<SupersetMarker letter="A" position={1} total={2} />)
    expect(screen.getByText('A1')).toBeTruthy()
    expect(screen.getByLabelText('Superset A, exercise 1 of 2')).toBeTruthy()
  })

  it('full shows the badge sentence', async () => {
    await render(<SupersetMarker letter="B" position={2} total={3} variant="full" />)
    expect(screen.getByText('Superset B · 2 of 3')).toBeTruthy()
  })

  it('rail renders', async () => {
    await render(<SupersetRail first />)
    expect(screen.getByTestId('superset-rail', { includeHiddenElements: true })).toBeTruthy()
  })
})

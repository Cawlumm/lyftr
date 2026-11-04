import { useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { moveItem, occurrenceKeys } from '@lyftr/shared'
import { ReorderExercisesSheet, dragTarget } from './ReorderExercisesSheet'

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// The sheet owns no order of its own: the screen does, so the harness plays the screen.
function Harness({ initial, onClose = jest.fn() }: { initial: string[]; onClose?: () => void }) {
  const [names, setNames] = useState(initial)
  return (
    <ReorderExercisesSheet
      open
      names={names}
      rowKeys={occurrenceKeys(names.map((n) => n.charCodeAt(0)))}
      onMove={(from, to) => setNames((prev) => moveItem(prev, from, to))}
      onClose={onClose}
    />
  )
}

// The rows in render order, read off each row's "Move … up" button.
const order = () => screen.getAllByLabelText(/^Move .* up$/)
  .map((b) => String(b.props.accessibilityLabel).replace(/^Move (.*) up$/, '$1'))

describe('ReorderExercisesSheet', () => {
  it('moves an exercise with the arrow buttons', async () => {
    await render(<Harness initial={['Squat', 'Bench', 'Row']} />)
    await fireEvent.press(screen.getByLabelText('Move Squat down'))
    expect(order()).toEqual(['Bench', 'Squat', 'Row'])
    await fireEvent.press(screen.getByLabelText('Move Row up'))
    expect(order()).toEqual(['Bench', 'Row', 'Squat'])
  })

  it('cannot move the first exercise up or the last one down', async () => {
    await render(<Harness initial={['Squat', 'Bench', 'Row']} />)
    expect(screen.getByLabelText('Move Squat up')).toBeDisabled()
    expect(screen.getByLabelText('Move Row down')).toBeDisabled()
    expect(screen.getByLabelText('Move Bench up')).not.toBeDisabled()
  })

  it('tells a screen reader where the exercise went', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await render(<Harness initial={['Squat', 'Bench', 'Row']} />)
    await fireEvent.press(screen.getByLabelText('Move Bench down'))
    expect(announce).toHaveBeenCalledWith('Bench moved to position 3 of 3')
    announce.mockRestore()
  })

  // The drag itself is driven with a real pointer in e2e/reorder.spec.ts; this is its arithmetic.
  it('turns a drag offset into the slot it lands in', () => {
    expect(dragTarget(0, 0, 3)).toBe(0)
    expect(dragTarget(0, 28, 3)).toBe(0) // under half a row: stays
    expect(dragTarget(0, 30, 3)).toBe(1)
    expect(dragTarget(0, 2 * 58, 3)).toBe(2)
    expect(dragTarget(0, 10 * 58, 3)).toBe(2) // past the end: last slot
    expect(dragTarget(2, -10 * 58, 3)).toBe(0) // past the top: first slot
  })

  it('closes on Done', async () => {
    const onClose = jest.fn()
    await render(<Harness initial={['Squat', 'Bench']} onClose={onClose} />)
    await fireEvent.press(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalled()
  })
})

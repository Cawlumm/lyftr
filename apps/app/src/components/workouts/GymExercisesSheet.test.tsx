import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { moveItem, occurrenceKeys } from '@lyftr/shared'
import { GymExercisesSheet, rowStatus, type ExerciseProgress, type ExercisesSheetMode } from './GymExercisesSheet'

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const EXERCISES: ExerciseProgress[] = [
  { name: 'Squat', done: 3, total: 3 },
  { name: 'Bench', done: 1, total: 3 },
  { name: 'Row', done: 0, total: 2 },
]

// The sheet owns no order of its own: the screen does, so the harness plays the screen.
function Harness({ open = 'list', current = 1, onJump = jest.fn(), onClose = jest.fn() }: {
  open?: ExercisesSheetMode
  current?: number
  onJump?: (i: number) => void
  onClose?: () => void
}) {
  const [list, setList] = useState(EXERCISES)
  return (
    <GymExercisesSheet
      open={open}
      exercises={list}
      rowKeys={occurrenceKeys(list.map((e) => e.name.charCodeAt(0)))}
      current={current}
      onJump={onJump}
      onMove={(from, to) => setList((prev) => moveItem(prev, from, to))}
      onClose={onClose}
    />
  )
}

const order = () => screen.getAllByLabelText(/^Move .* up$/)
  .map((b) => String(b.props.accessibilityLabel).replace(/^Move (.*) up$/, '$1'))

describe('rowStatus', () => {
  it('marks the exercise being worked as current, even once it is done', () => {
    expect(rowStatus(0, 0, EXERCISES[0])).toBe('current')
    expect(rowStatus(0, 1, EXERCISES[0])).toBe('done')
    expect(rowStatus(2, 1, EXERCISES[2])).toBe('upcoming')
    // No sets is not done.
    expect(rowStatus(0, 1, { name: 'Curl', done: 0, total: 0 })).toBe('upcoming')
  })
})

describe('GymExercisesSheet', () => {
  it('lists every exercise with its sets and where you are', async () => {
    await render(<Harness />)
    expect(screen.getByText('Exercises')).toBeTruthy()
    expect(screen.getByLabelText('1. Squat, done, 3/3 sets done')).toBeTruthy()
    expect(screen.getByLabelText('2. Bench, current exercise, 1/3 sets done')).toBeTruthy()
    expect(screen.getByLabelText('3. Row, 0/2 sets done')).toBeTruthy()
  })

  it('jumps to the exercise tapped', async () => {
    const onJump = jest.fn()
    await render(<Harness onJump={onJump} />)
    await fireEvent.press(screen.getByLabelText('3. Row, 0/2 sets done'))
    expect(onJump).toHaveBeenCalledWith(2)
  })

  it('turns into the reorder list and back with one button', async () => {
    await render(<Harness />)
    await fireEvent.press(screen.getByRole('button', { name: 'Reorder exercises' }))
    expect(screen.getByText('Reorder exercises')).toBeTruthy()
    expect(order()).toEqual(['Squat', 'Bench', 'Row'])
    await fireEvent.press(screen.getByLabelText('Move Row up'))
    expect(order()).toEqual(['Squat', 'Row', 'Bench'])

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Exercises')).toBeTruthy()
    expect(screen.queryByLabelText(/^Move /)).toBeNull()
    // The list shows the new order.
    expect(screen.getByLabelText('2. Row, current exercise, 0/2 sets done')).toBeTruthy()
  })

  it('closes on Done when it was opened for reordering', async () => {
    const onClose = jest.fn()
    await render(<Harness open="reorder" onClose={onClose} />)
    expect(order()).toEqual(['Squat', 'Bench', 'Row'])
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('offers no reorder for a single exercise', async () => {
    await render(
      <GymExercisesSheet
        open="list" exercises={[EXERCISES[0]]} rowKeys={['a']} current={0}
        onJump={jest.fn()} onMove={jest.fn()} onClose={jest.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Reorder exercises' })).toBeNull()
  })

  it('closes from its Close button', async () => {
    const onClose = jest.fn()
    await render(<Harness onClose={onClose} />)
    await fireEvent.press(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('badges a superset member and names it in the row label', async () => {
    const list: ExerciseProgress[] = [
      { name: 'Squat', done: 0, total: 3 },
      { name: 'Bench', done: 0, total: 3, superset: { letter: 'A', position: 1, total: 2 } },
      { name: 'Row', done: 0, total: 2, superset: { letter: 'A', position: 2, total: 2 } },
    ]
    await render(<GymExercisesSheet open="list" exercises={list} rowKeys={['a', 'b', 'c']} current={0} onJump={jest.fn()} onMove={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByText('A1')).toBeTruthy()
    expect(screen.getByText('A2')).toBeTruthy()
    expect(screen.queryByText('A3')).toBeNull()
    expect(screen.getAllByTestId('thumb-fallback')).toHaveLength(3)
    expect(screen.getByLabelText(/^2\. Bench.*Superset A, exercise 1 of 2$/)).toBeTruthy()
  })
})

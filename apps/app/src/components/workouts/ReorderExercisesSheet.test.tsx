import { useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { moveItem, normaliseSupersets, occurrenceKeys } from '@lyftr/shared'
import { ReorderExercisesSheet, dragTarget, shiftFor } from './ReorderExercisesSheet'

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

// A finger on row `index`'s body, driven through the row's own responder handlers the way
// RN's touch system would: PanResponder reads positions off the event's touchHistory.
function finger(index: number, startY = 100) {
  const handlers = () => screen.getByTestId(`reorder-body-${index}`).props
  let ts = 1
  let prevY = startY
  const event = (y: number) => {
    ts += 16
    const e = {
      nativeEvent: { type: 'touchmove', pageX: 0, pageY: y, locationX: 0, locationY: 0, touches: [], changedTouches: [], identifier: 0, target: 0, timestamp: ts },
      touchHistory: {
        numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: ts,
        touchBank: [{
          touchActive: true, startPageX: 0, startPageY: startY, startTimeStamp: 1,
          currentPageX: 0, currentPageY: y, currentTimeStamp: ts,
          previousPageX: 0, previousPageY: prevY, previousTimeStamp: ts - 16,
        }],
      },
    }
    prevY = y
    return e
  }
  // The handlers are read again for every event: the row re-renders as the drag goes on.
  return {
    down: () => act(() => { handlers().onResponderGrant(event(startY)) }),
    hold: (ms: number) => act(() => { jest.advanceTimersByTime(ms) }),
    moveTo: (y: number) => act(() => { handlers().onResponderMove(event(y)) }),
    up: () => act(() => { handlers().onResponderRelease(event(prevY)) }),
    cancel: () => act(() => { handlers().onResponderTerminate(event(prevY)) }),
  }
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

  it('turns a slot change into the shift of each row in between', () => {
    // Row 0 held over slot 2: rows 1 and 2 move up a stride, row 3 stays.
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 0, 2))).toEqual([0, -58, -58, 0])
    // Row 3 held over slot 1: rows 1 and 2 move down a stride.
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 3, 1))).toEqual([0, 58, 58, 0])
  })

  describe('dragging a row by its body', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('lifts after a short hold and drops where it is released', async () => {
      await render(<Harness initial={['Squat', 'Bench', 'Row', 'Curl']} />)
      const f = finger(0)
      await f.down()
      await f.hold(250)
      await f.moveTo(100 + 2 * 58)
      // Nothing moves until the finger lets go.
      expect(order()).toEqual(['Squat', 'Bench', 'Row', 'Curl'])
      await f.up()
      expect(order()).toEqual(['Bench', 'Row', 'Squat', 'Curl'])
    })

    it('treats a finger that moves before the hold completes as a scroll', async () => {
      await render(<Harness initial={['Squat', 'Bench', 'Row']} />)
      const f = finger(0)
      await f.down()
      await f.moveTo(100 + 40)
      await f.hold(250)
      await f.moveTo(100 + 2 * 58)
      await f.up()
      expect(order()).toEqual(['Squat', 'Bench', 'Row'])
    })

    it('puts the row back when the gesture is taken away', async () => {
      await render(<Harness initial={['Squat', 'Bench', 'Row']} />)
      const f = finger(2)
      await f.down()
      await f.hold(250)
      await f.moveTo(100 - 2 * 58)
      await f.cancel()
      expect(order()).toEqual(['Squat', 'Bench', 'Row'])
    })

    it('announces where a dropped row went', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
      await render(<Harness initial={['Squat', 'Bench', 'Row']} />)
      const f = finger(2)
      await f.down()
      await f.hold(250)
      await f.moveTo(100 - 58)
      await f.up()
      expect(order()).toEqual(['Squat', 'Row', 'Bench'])
      expect(announce).toHaveBeenCalledWith('Row moved to position 2 of 3')
      announce.mockRestore()
    })
  })

  it('closes on Done', async () => {
    const onClose = jest.fn()
    await render(<Harness initial={['Squat', 'Bench']} onClose={onClose} />)
    await fireEvent.press(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ReorderExercisesSheet supersets', () => {
  function LinkedHarness({ initial }: { initial: { name: string; superset_group: number | null }[] }) {
    const [rows, setRows] = useState(initial)
    return (
      <ReorderExercisesSheet
        open
        names={rows.map((r) => r.name)}
        rowKeys={occurrenceKeys(rows.map((r) => r.name.charCodeAt(0)))}
        groups={rows.map((r) => r.superset_group)}
        onMove={(from, to) => setRows((prev) => normaliseSupersets(moveItem(prev, from, to)))}
        onClose={() => {}}
      />
    )
  }
  const rows = [
    { name: 'Squat', superset_group: 1 },
    { name: 'Bench', superset_group: 1 },
    { name: 'Row', superset_group: null },
  ]

  it('shows each member\'s letter and place', async () => {
    await render(<LinkedHarness initial={rows} />)
    expect(screen.getByLabelText('Superset A, exercise 1 of 2')).toBeTruthy()
    expect(screen.getByLabelText('Superset A, exercise 2 of 2')).toBeTruthy()
  })

  it('says so when a move takes a member out of its superset', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await render(<LinkedHarness initial={rows} />)
    await fireEvent.press(screen.getByLabelText('Move Bench down'))
    expect(announce).toHaveBeenCalledWith('Bench moved to position 3 of 3 and unlinked from its superset')
    expect(screen.queryByLabelText(/^Superset A/)).toBeNull()
    announce.mockRestore()
  })

  it('keeps the plain announcement when the member stays inside its run', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await render(<LinkedHarness initial={rows} />)
    await fireEvent.press(screen.getByLabelText('Move Squat down'))
    expect(announce).toHaveBeenCalledWith('Squat moved to position 2 of 3')
    expect(screen.getAllByLabelText(/^Superset A/)).toHaveLength(2)
    announce.mockRestore()
  })
})

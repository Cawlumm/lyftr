import { fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { Text } from 'react-native'
import {
  AddSupersetPill, ExerciseThumb, SupersetBlock, SupersetConnector, SupersetRestFooter, SupersetSheet, UpNextPill, groupColors,
} from './index'
import { TOUCH_MIN } from '../../ui/interaction'

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

describe('SupersetBlock (en)', () => {
  it('outside a live session shows the round count, not a current-round marker', async () => {
    await render(<SupersetBlock letter="A" colorIndex={0} count={2} round={0} total={3}><Text>x</Text></SupersetBlock>)
    expect(screen.getByText('3 rounds')).toBeTruthy()
    expect(screen.queryByTestId('round-dot-current')).toBeNull()
    expect(screen.getByLabelText('Superset A, 2 exercises, 3 rounds')).toBeTruthy()
  })

  it('labels the group as one unit and shows the header copy', async () => {
    await render(
      <SupersetBlock live letter="A" colorIndex={0} count={2} round={1} total={3} footer={<Text>foot</Text>}>
        <Text>member</Text>
      </SupersetBlock>,
    )
    expect(screen.getByLabelText('Superset A, 2 exercises, round 2 of 3')).toBeTruthy()
    expect(screen.getByText('Superset A')).toBeTruthy()
    expect(screen.getByText('Alternate sets · rest after each round')).toBeTruthy()
    expect(screen.getByText('member')).toBeTruthy()
    expect(screen.getByText('foot')).toBeTruthy()
  })

  it('draws one dot per round: done, current, upcoming', async () => {
    await render(<SupersetBlock live letter="A" colorIndex={0} count={2} round={1} total={3}><Text>x</Text></SupersetBlock>)
    expect(screen.getAllByTestId('round-dot-done', { includeHiddenElements: true })).toHaveLength(1)
    expect(screen.getAllByTestId('round-dot-current', { includeHiddenElements: true })).toHaveLength(1)
    expect(screen.getAllByTestId('round-dot-upcoming', { includeHiddenElements: true })).toHaveLength(1)
  })

  it('switches to text above five rounds', async () => {
    await render(<SupersetBlock live letter="B" colorIndex={1} count={2} round={1} total={8}><Text>x</Text></SupersetBlock>)
    expect(screen.getByText('Round 2 of 8')).toBeTruthy()
    expect(screen.queryByTestId('round-dot-done', { includeHiddenElements: true })).toBeNull()
  })

  it('clamps a finished group to its last round', async () => {
    await render(<SupersetBlock live letter="A" colorIndex={0} count={2} round={3} total={3}><Text>x</Text></SupersetBlock>)
    expect(screen.getByLabelText('Superset A, 2 exercises, round 3 of 3')).toBeTruthy()
  })
})

describe('colours', () => {
  it('cycles cyan, violet, cyan and differs by theme', () => {
    expect(groupColors(2, false)).toEqual(groupColors(0, false))
    expect(groupColors(1, false).solid).not.toBe(groupColors(0, false).solid)
    expect(groupColors(0, true).tint).not.toBe(groupColors(0, false).tint)
  })
})

describe('pieces (en)', () => {
  it('connector names the next exercise', async () => {
    await render(<SupersetConnector nextName="Row" colorIndex={0} />)
    expect(screen.getByLabelText('Straight to Row, no rest')).toBeTruthy()
  })

  it('rest footer says what comes after, and drops it on the last round', async () => {
    const { rerender } = await render(<SupersetRestFooter rest="1:15" afterName="Row" nextRound={3} colorIndex={0} />)
    expect(screen.getByLabelText('Rest 1:15 after Row, then round 3')).toBeTruthy()
    await rerender(<SupersetRestFooter rest="1:15" afterName="Row" nextRound={null} colorIndex={0} />)
    expect(screen.getByLabelText('Rest 1:15 after Row')).toBeTruthy()
  })

  it('thumb shows the tag, and a dumbbell tile without an image', async () => {
    await render(<ExerciseThumb tag="A1" />)
    expect(screen.getByText('A1')).toBeTruthy()
    expect(screen.getByTestId('thumb-fallback')).toBeTruthy()
  })

  it('up next pill', async () => {
    await render(<UpNextPill />)
    expect(screen.getByText('Up next')).toBeTruthy()
  })

  it('add pill is labelled, presses, carries no selected state and is padded to 44', async () => {
    const onPress = jest.fn()
    await render(<AddSupersetPill aName="Bench" bName="Row" onPress={onPress} />)
    const btn = screen.getByLabelText('Superset Bench with Row')
    expect(screen.getByText('Superset')).toBeTruthy()
    await fireEvent.press(btn)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(btn.props.accessibilityState?.selected).toBeUndefined()
    const flat = Object.assign({}, ...[btn.props.style].flat(3).filter(Boolean))
    expect(32 + 2 * flat.paddingVertical).toBeGreaterThanOrEqual(TOUCH_MIN)
  })
})

describe('SupersetSheet (en)', () => {
  const candidates = [
    { index: 1, name: 'Row', muscle: 'Back' },
    { index: 3, name: 'Curl', muscle: 'Biceps' },
  ]
  const base = { visible: true, currentName: 'Bench', currentIndex: 0, candidates, restLabel: '1:15', onCreate: jest.fn(), onClose: jest.fn() }

  it('renders nothing when closed', async () => {
    await render(<SupersetSheet {...base} visible={false} />)
    expect(screen.queryByText('Make a superset')).toBeNull()
  })

  it('lists candidates, and says which ones move', async () => {
    await render(<SupersetSheet {...base} />)
    expect(screen.getByText('Make a superset')).toBeTruthy()
    expect(screen.getByText('Pair Bench with')).toBeTruthy()
    expect(screen.getByText('Back')).toBeTruthy()
    expect(screen.getByText('Biceps · moves it next to Bench')).toBeTruthy()
  })

  it('disables Create until something is picked, then creates with the index', async () => {
    const onCreate = jest.fn()
    await render(<SupersetSheet {...base} onCreate={onCreate} />)
    await fireEvent.press(screen.getByText('Create superset'))
    expect(onCreate).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('radio', { name: 'Curl' }))
    expect(screen.getByText('You\'ll rest 1:15 after Curl each round. Change it any time.')).toBeTruthy()
    await fireEvent.press(screen.getByText('Create superset'))
    expect(onCreate).toHaveBeenCalledWith(3)
  })

  it('preselects, as a radio, with no aria-selected', async () => {
    await render(<SupersetSheet {...base} preselect={1} />)
    const radio = screen.getByRole('radio', { name: 'Row' })
    expect(radio.props.accessibilityState).toMatchObject({ checked: true })
    expect(radio.props.accessibilityState.selected).toBeUndefined()
    expect(screen.getByRole('radio', { name: 'Curl' }).props.accessibilityState).toMatchObject({ checked: false })
  })

  it('Cancel closes', async () => {
    const onClose = jest.fn()
    await render(<SupersetSheet {...base} onClose={onClose} />)
    await fireEvent.press(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })
})

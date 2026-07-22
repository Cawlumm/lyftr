import { fireEvent, render, screen } from '@testing-library/react-native'

// Same transitive-import stubs as DayPickerSheet.test.tsx (ui barrel → useTheme →
// lib/lyftr → expo-router; storage adapter → AsyncStorage; Sheet → safe-area).
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import { ProgramDaysEditor } from './ProgramDaysEditor'
import type { DayDraft } from './types'

const dayDraft = (overrides: Partial<DayDraft> = {}): DayDraft => ({
  order_index: 0,
  is_rest_day: false,
  name: '',
  exercises: [],
  ...overrides,
})

const renderEditor = (days: DayDraft[], onChange = jest.fn()) => {
  render(
    <ProgramDaysEditor
      days={days}
      onChange={onChange}
      pickerExercises={{}}
      onCacheExercise={() => {}}
      unit="lbs"
      restSecondsDefault={90}
    />
  )
  return onChange
}

describe('ProgramDaysEditor', () => {
  it('renders the empty state when there are no days', () => {
    renderEditor([])
    expect(screen.getByText(/No days yet/)).toBeTruthy()
  })

  it('Add Workout Day appends a workout day with a reindexed order_index', () => {
    const onChange = renderEditor([dayDraft({ name: 'Push' })])
    fireEvent.press(screen.getByText('Add Workout Day'))
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ order_index: 1, is_rest_day: false, exercises: [] })
  })

  it('Add Rest Day appends a rest day', () => {
    const onChange = renderEditor([])
    fireEvent.press(screen.getByText('Add Rest Day'))
    expect(onChange.mock.calls[0][0]).toEqual([dayDraft({ is_rest_day: true })])
  })

  it('removing a day reindexes the survivors', () => {
    const onChange = renderEditor([
      dayDraft({ order_index: 0, name: 'A' }),
      dayDraft({ order_index: 1, name: 'B' }),
      dayDraft({ order_index: 2, name: 'C' }),
    ])
    fireEvent.press(screen.getAllByLabelText('Remove day')[1])
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next.map((d) => d.name)).toEqual(['A', 'C'])
    expect(next.map((d) => d.order_index)).toEqual([0, 1])
  })

  it('move-down swaps a day with its neighbor and rewrites order_index', () => {
    const onChange = renderEditor([
      dayDraft({ order_index: 0, name: 'A' }),
      dayDraft({ order_index: 1, name: 'B' }),
    ])
    fireEvent.press(screen.getByLabelText('Move day 1 down'))
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next.map((d) => d.name)).toEqual(['B', 'A'])
    expect(next.map((d) => d.order_index)).toEqual([0, 1])
  })

  it('move-up on the first day is a no-op (disabled)', () => {
    const onChange = renderEditor([dayDraft({ name: 'A' }), dayDraft({ order_index: 1, name: 'B' })])
    fireEvent.press(screen.getByLabelText('Move day 1 up'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('toggling a workout day to rest CLEARS its exercises (a rest day never carries any)', () => {
    const exercises = [{ exercise_id: 1, notes: '', rest_seconds: 90, sets: [] }]
    const onChange = renderEditor([dayDraft({ exercises })])
    fireEvent.press(screen.getByText('Rest'))
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next[0].is_rest_day).toBe(true)
    expect(next[0].exercises).toEqual([])
  })

  it('renaming a day emits the patch without touching siblings', () => {
    const onChange = renderEditor([dayDraft({ name: 'A' }), dayDraft({ order_index: 1, name: 'B' })])
    fireEvent.changeText(screen.getAllByPlaceholderText(/^Day \d$/)[0], 'Push')
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next[0].name).toBe('Push')
    expect(next[1].name).toBe('B')
  })
})

import { fireEvent, render, screen } from '@testing-library/react-native'
import type { Exercise } from '@lyftr/shared'

// Same transitive-import stubs as DayPickerSheet.test.tsx (ui barrel → useTheme →
// lib/lyftr → expo-router; storage adapter → AsyncStorage; sheets → safe-area).
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import { DayExercisesEditor } from './DayExercisesEditor'
import type { DayExerciseDraft } from './types'

const bench: Exercise = {
  id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: [],
  category: 'strength', equipment: 'barbell', description: '',
}

const draft = (overrides: Partial<DayExerciseDraft> = {}): DayExerciseDraft => ({
  exercise_id: 1,
  notes: '',
  rest_seconds: 90,
  sets: [{ set_number: 1, reps: 5, weight: 135 }],
  ...overrides,
})

const renderEditor = (exercises: DayExerciseDraft[], onChange = jest.fn()) => {
  render(
    <DayExercisesEditor
      exercises={exercises}
      onChange={onChange}
      pickerExercises={{ 1: bench }}
      onCacheExercise={() => {}}
      unit="lbs"
      restSecondsDefault={90}
    />
  )
  return onChange
}

describe('DayExercisesEditor', () => {
  it('renders the empty state when the day has no exercises', () => {
    renderEditor([])
    expect(screen.getByText('No exercises yet')).toBeTruthy()
  })

  it('shows the cached exercise', () => {
    renderEditor([draft()])
    expect(screen.getByText('Bench Press')).toBeTruthy()
  })

  it('Add Set appends a set with the next set_number', () => {
    const onChange = renderEditor([draft()])
    fireEvent.press(screen.getByText('Add Set'))
    const next: DayExerciseDraft[] = onChange.mock.calls[0][0]
    expect(next[0].sets).toHaveLength(2)
    expect(next[0].sets[1]).toEqual({ set_number: 2, reps: 0, weight: 0 })
  })

  it('editing reps coerces to a number (garbage → 0)', () => {
    const onChange = renderEditor([draft()])
    fireEvent.changeText(screen.getByLabelText('Set reps'), '8')
    expect(onChange.mock.calls[0][0][0].sets[0].reps).toBe(8)
    fireEvent.changeText(screen.getByLabelText('Set reps'), 'abc')
    expect(onChange.mock.calls[1][0][0].sets[0].reps).toBe(0)
  })

  it('removing the exercise emits an empty list', () => {
    const onChange = renderEditor([draft()])
    fireEvent.press(screen.getByLabelText('Remove Bench Press'))
    expect(onChange.mock.calls[0][0]).toEqual([])
  })

  it('removing a set only touches that set', () => {
    const onChange = renderEditor([draft({
      sets: [
        { set_number: 1, reps: 5, weight: 135 },
        { set_number: 2, reps: 5, weight: 145 },
      ],
    })])
    fireEvent.press(screen.getAllByLabelText('Remove set')[0])
    const next: DayExerciseDraft[] = onChange.mock.calls[0][0]
    expect(next[0].sets).toHaveLength(1)
    expect(next[0].sets[0].weight).toBe(145)
  })
})

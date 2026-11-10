import { act, fireEvent, render, screen } from '@testing-library/react-native'
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
import { SHEET_ANIM_MS } from '../ui/Sheet'

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

const renderEditor = async (exercises: DayExerciseDraft[], onChange = jest.fn()) => {
  await render(
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


const pickMenu = async (idx: number, item: string) => {
  jest.useFakeTimers()
  await fireEvent.press(screen.getAllByLabelText('More options')[idx])
  await fireEvent.press(await screen.findByText(item))
  await act(async () => { jest.advanceTimersByTime(SHEET_ANIM_MS + 50) })
  jest.useRealTimers()
}

describe('DayExercisesEditor', () => {
  it('renders the empty state when the day has no exercises', async () => {
    await renderEditor([])
    expect(screen.getByText('No exercises yet')).toBeTruthy()
  })

  it('shows the cached exercise', async () => {
    await renderEditor([draft()])
    expect(screen.getByText('Bench Press')).toBeTruthy()
  })

  it('Add Set appends a set copying the previous set\'s reps/weight', async () => {
    const onChange = await renderEditor([draft()]) // draft's one set: { set_number: 1, reps: 5, weight: 135 }
    await fireEvent.press(screen.getByText('Add Set'))
    const next: DayExerciseDraft[] = onChange.mock.calls[0][0]
    expect(next[0].sets).toHaveLength(2)
    expect(next[0].sets[1]).toEqual({ set_number: 2, reps: 5, weight: 135 })
  })

  it('Add Set on the first set (no prior set) falls back to 0/0', async () => {
    const onChange = await renderEditor([draft({ sets: [] })])
    await fireEvent.press(screen.getByText('Add Set'))
    const next: DayExerciseDraft[] = onChange.mock.calls[0][0]
    expect(next[0].sets).toEqual([{ set_number: 1, reps: 0, weight: 0 }])
  })

  it('editing reps coerces to a number (garbage → 0)', async () => {
    const onChange = await renderEditor([draft()])
    await fireEvent.changeText(screen.getByLabelText('Set reps'), '8')
    expect(onChange.mock.calls[0][0][0].sets[0].reps).toBe(8)
    await fireEvent.changeText(screen.getByLabelText('Set reps'), 'abc')
    expect(onChange.mock.calls[1][0][0].sets[0].reps).toBe(0)
  })

  it('removing the exercise emits an empty list', async () => {
    const onChange = await renderEditor([draft()])
    await fireEvent.press(screen.getByLabelText('Remove Bench Press'))
    expect(onChange.mock.calls[0][0]).toEqual([])
  })

  it('removing a set only touches that set', async () => {
    const onChange = await renderEditor([draft({
      sets: [
        { set_number: 1, reps: 5, weight: 135 },
        { set_number: 2, reps: 5, weight: 145 },
      ],
    })])
    await fireEvent.press(screen.getAllByLabelText('Remove set')[0])
    const next: DayExerciseDraft[] = onChange.mock.calls[0][0]
    expect(next[0].sets).toHaveLength(1)
    expect(next[0].sets[0].weight).toBe(145)
  })

  describe('supersets', () => {
    const row = (superset_group: number | null = null) => draft({ superset_group })

    it('offers a Superset pill between each pair of unlinked cards and none after the last', async () => {
      await renderEditor([row(), row(), row()])
      expect(screen.getAllByLabelText('Superset Bench Press with Bench Press')).toHaveLength(2)
    })

    it('linking through the pill and sheet emits both rows in one group', async () => {
      const onChange = await renderEditor([row(), row()])
      await fireEvent.press(screen.getAllByLabelText('Superset Bench Press with Bench Press')[0])
      await fireEvent.press(await screen.findByText('Create superset'))
      const next: DayExerciseDraft[] = onChange.mock.calls[0][0]
      expect(next.map((e) => e.superset_group)).toEqual([1, 1])
    })

    it('linking through the card menu opens the same sheet', async () => {
      const onChange = await renderEditor([row(), row()])
      await pickMenu(0, 'Superset with…')
      expect(screen.getByText('Make a superset')).toBeTruthy()
      await fireEvent.press(screen.getByLabelText('Bench Press'))
      await fireEvent.press(screen.getByText('Create superset'))
      expect(onChange.mock.calls[0][0].map((e: DayExerciseDraft) => e.superset_group)).toEqual([1, 1])
    })

    it('removing from the superset in the menu emits null groups again', async () => {
      const onChange = await renderEditor([row(1), row(1)])
      await pickMenu(0, 'Remove from superset A')
      const next: DayExerciseDraft[] = onChange.mock.calls[0][0]
      expect(next.map((e) => e.superset_group)).toEqual([null, null])
    })

    it('draws one labelled block with tags, connector and rest footer, and no per-member rest label', async () => {
      await renderEditor([row(1), row(1)])
      expect(screen.getByLabelText('Superset A, 2 exercises, 1 round')).toBeTruthy()
      expect(screen.getByText('A1')).toBeTruthy()
      expect(screen.getByText('A2')).toBeTruthy()
      expect(screen.queryByText('Rest after the round')).toBeNull()
      expect(screen.getByText(/^Rest 90s after Bench Press/)).toBeTruthy()
    })

    it('removing a member dissolves the partner it leaves alone', async () => {
      const onChange = await renderEditor([row(1), row(1)])
      await fireEvent.press(screen.getAllByLabelText('Remove Bench Press')[0])
      expect(onChange.mock.calls[0][0].map((e: DayExerciseDraft) => e.superset_group)).toEqual([null])
    })

    it('keeps the group on every other edit', async () => {
      const onChange = await renderEditor([row(1), row(1)])
      await fireEvent.press(screen.getAllByText('Add Set')[0])
      expect(onChange.mock.calls[0][0].map((e: DayExerciseDraft) => e.superset_group)).toEqual([1, 1])
    })
  })
})

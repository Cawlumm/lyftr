import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { i18n } from '@lyftr/shared'
import { client } from './lyftr'
import EditWorkout from '../../app/(tabs)/workouts/[id]/edit'
import AddWorkout from '../../app/(tabs)/workouts/new'
import { SHEET_ANIM_MS } from '../components/ui/Sheet'

// A linked pair has to survive load -> save: the server's Update deletes and re-inserts the
// exercise rows, so a mapper that drops superset_group silently unlinks them.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true, dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: '7' }),
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: unknown }) => children,
}))
jest.mock('../components/workouts/ProgramPicker', () => {
  const { Pressable, Text } = require('react-native')
  const day = {
    id: 1, order_index: 0, is_rest_day: false, name: 'Day',
    exercises: [1, 2, 3].map((id) => ({
      exercise_id: id, exercise: { id, name: `Move ${id}`, muscle_group: 'chest' }, notes: '', rest_seconds: 60,
      superset_group: id === 3 ? null : 1,
      sets: [{ set_number: 1, target_reps: 5, target_weight: 100 }],
    })),
  }
  return {
    ProgramPicker: ({ onSelect }: { onSelect: (p: unknown, d: unknown) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onSelect({}, day)}><Text>pick-day</Text></Pressable>
    ),
  }
})

const ex = (id: number, group: number | null) => ({
  exercise_id: id, exercise: { id, name: `Move ${id}`, muscle_group: 'chest' }, notes: '', rest_seconds: 60,
  superset_group: group, sets: [{ set_number: 1, reps: 5, weight: 100 }],
})

const pickMenu = async (idx: number, item: string) => {
  jest.useFakeTimers()
  await fireEvent.press(screen.getAllByLabelText('More options')[idx])
  await fireEvent.press(await screen.findByText(item))
  await act(async () => { jest.advanceTimersByTime(SHEET_ANIM_MS + 50) })
  jest.useRealTimers()
}

beforeEach(async () => { await i18n.changeLanguage('en') })
afterEach(() => jest.restoreAllMocks())

const groups = (payload: { exercises: { superset_group?: number | null }[] }) =>
  payload.exercises.map((e) => e.superset_group)

it('edit: a linked workout is still linked after load and save', async () => {
  jest.spyOn(client.workoutAPI, 'get').mockResolvedValue({
    id: 7, name: 'Legs', notes: '', duration: 3600, started_at: '2026-04-25T10:00:00Z', tz_offset_minutes: 0,
    exercises: [ex(1, 1), ex(2, 1), ex(3, null)],
  } as never)
  const update = jest.spyOn(client.workoutAPI, 'update').mockResolvedValue({} as never)
  await render(<EditWorkout />)
  await screen.findByLabelText(/^Superset A, 2 exercises/)
  expect(screen.getByLabelText('Superset Move 2 with Move 3')).toBeTruthy()
  await fireEvent.press(screen.getByText('Save Changes'))
  await waitFor(() => expect(update).toHaveBeenCalled())
  expect(groups(update.mock.calls[0][1] as never)).toEqual([1, 1, null])
})

it('edit: unlinking the pair saves null groups', async () => {
  jest.spyOn(client.workoutAPI, 'get').mockResolvedValue({
    id: 7, name: 'Legs', notes: '', duration: 3600, started_at: '2026-04-25T10:00:00Z', tz_offset_minutes: 0,
    exercises: [ex(1, 1), ex(2, 1), ex(3, null)],
  } as never)
  const update = jest.spyOn(client.workoutAPI, 'update').mockResolvedValue({} as never)
  await render(<EditWorkout />)
  await screen.findByLabelText(/^Superset A, 2 exercises/)
  await pickMenu(0, 'Remove from superset A')
  await fireEvent.press(screen.getByText('Save Changes'))
  await waitFor(() => expect(update).toHaveBeenCalled())
  expect(groups(update.mock.calls[0][1] as never)).toEqual([null, null, null])
})

it('new: loading a program day keeps its superset into the saved workout', async () => {
  const create = jest.spyOn(client.workoutAPI, 'create').mockResolvedValue({} as never)
  await render(<AddWorkout />)
  await fireEvent.press(screen.getByText('Load Program'))
  await fireEvent.press(await screen.findByText('pick-day'))
  await screen.findByLabelText(/^Superset A, 2 exercises/)
  await fireEvent.changeText(screen.getByPlaceholderText('e.g., Leg Day, Push Day'), 'Legs')
  await fireEvent.press(screen.getByText('Save Workout'))
  await waitFor(() => expect(create).toHaveBeenCalled())
  expect(groups(create.mock.calls[0][0] as never)).toEqual([1, 1, null])
})

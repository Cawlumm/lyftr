import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { i18n, type ActiveSession } from '@lyftr/shared'
import { useSettingsStore, useWorkoutSession } from '../../lib/lyftr'
import { GymModeWorkout } from './GymModeWorkout'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
  usePathname: () => '/workouts/active',
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: unknown }) => children,
}))

const session = (): ActiveSession => ({
  name: 'Workout', started_at: new Date().toISOString(), tz_offset_minutes: 0,
  exercises: [{
    exercise_id: 1,
    exercise: { id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: [], category: 'strength', equipment: 'barbell', description: '' },
    notes: '', rest_seconds: 90,
    sets: [1, 2, 3].map((set_number) => ({
      set_number, target_reps: 8, target_weight: 100, actual_reps: 8, actual_weight: 100,
      completed: set_number === 1,
    })),
  }],
})

beforeEach(async () => {
  jest.useFakeTimers()
  await i18n.changeLanguage('en')
  useSettingsStore.setState(({ settings }) => ({ settings: { ...settings, rest_enabled: true } }))
  useWorkoutSession.setState({ session: session(), gymPhase: 'exercise', gymExIdx: 0, gymSetIdx: 1 })
  useWorkoutSession.getState().startRest(90, 0, 0)
})

afterEach(() => {
  useWorkoutSession.getState().cancelSession()
  jest.useRealTimers()
})

it.each([false, true])('can complete the next set during rest (paused: %s)', async (paused) => {
  if (paused) useWorkoutSession.getState().pauseRest()
  const view = await render(<GymModeWorkout />)
  await act(async () => { jest.advanceTimersByTime(15_000) })

  await fireEvent.press(screen.getByText('Complete Set'))

  const state = useWorkoutSession.getState()
  expect(state.session!.exercises[0].sets.map((set) => set.completed)).toEqual([true, true, false])
  expect(state.gymSetIdx).toBe(2)
  expect(state.restSetIdx).toBe(1)
  expect(state.restEndsAt).toBe(Date.now() + 90_000)
  expect(state.restPausedRemainingMs).toBeNull()
  expect(screen.getByText('Complete Set')).toBeTruthy()

  // Undoing the set that owns the new timer still clears that timer.
  await act(async () => { state.setGymState('exercise', 0, 1) })
  await fireEvent.press(screen.getByText('Completed'))
  expect(useWorkoutSession.getState().restEndsAt).toBeNull()
  expect(useWorkoutSession.getState().session!.exercises[0].sets[1].completed).toBe(false)
  await view.unmount()
})

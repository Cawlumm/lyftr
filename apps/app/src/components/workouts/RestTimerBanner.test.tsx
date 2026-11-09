import { act, render, screen } from '@testing-library/react-native'
import { i18n, type ActiveSession } from '@lyftr/shared'
import { useWorkoutSession } from '../../lib/lyftr'
import { RestTimerBanner } from './RestTimerBanner'

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mk = (id: number, name: string, group: number | null, doneFirst: boolean) => ({
  exercise_id: id,
  exercise: { id, name, muscle_group: 'chest', secondary_muscles: [], category: 'strength', equipment: 'barbell', description: '' },
  notes: '', rest_seconds: 60, superset_group: group,
  sets: [1, 2].map((set_number) => ({
    set_number, target_reps: 8, target_weight: 100, actual_reps: 8, actual_weight: 100, completed: set_number === 1 && doneFirst,
  })),
})
const seed = (exercises: ReturnType<typeof mk>[]) => {
  const s: ActiveSession = { name: 'W', started_at: new Date().toISOString(), tz_offset_minutes: 0, exercises }
  useWorkoutSession.setState({ session: s })
}

beforeEach(async () => {
  jest.useFakeTimers()
  await i18n.changeLanguage('en')
})
afterEach(() => {
  useWorkoutSession.getState().cancelSession()
  jest.useRealTimers()
})

it('names the next exercise when the next step is a superset partner', async () => {
  seed([mk(1, 'Bench Press', 1, true), mk(2, 'Row', 1, false)])
  useWorkoutSession.getState().startRest(60, 0, 0)
  await render(<RestTimerBanner />)
  await act(async () => {})
  expect(screen.getByText('Set 1 done · Row next')).toBeTruthy()
})

it('keeps the set number for an exercise outside a superset', async () => {
  seed([mk(1, 'Bench Press', null, true), mk(2, 'Row', null, false)])
  useWorkoutSession.getState().startRest(60, 0, 0)
  await render(<RestTimerBanner />)
  await act(async () => {})
  expect(screen.getByText('Set 1 done · set 2 next')).toBeTruthy()
})

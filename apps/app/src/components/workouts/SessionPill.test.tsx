import { act, render } from '@testing-library/react-native'
import { Text } from 'react-native'
import type { ActiveSession } from '@lyftr/shared'
import { useWorkoutSession } from '../../lib/lyftr'
import { useSessionPillInset } from './SessionPill'

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'))

const session: ActiveSession = {
  name: 'W', started_at: new Date().toISOString(), tz_offset_minutes: 0,
  exercises: [{
    exercise_id: 1,
    exercise: { id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: [], category: 'strength', equipment: 'barbell', description: '' },
    notes: '', rest_seconds: 60, superset_group: null,
    sets: [{ set_number: 1, target_reps: 8, target_weight: 100, actual_reps: 8, actual_weight: 100, completed: false }],
  }],
}

afterEach(() => useWorkoutSession.getState().cancelSession())

// Most screens call this hook and stay mounted under a live workout. If it re-rendered them on
// every set change, each tap in the workout would re-render all of those hidden screens too.
it('re-renders its screen when a workout starts or ends, not on every set change', async () => {
  let renders = 0
  function Probe() {
    renders++
    return <Text>{useSessionPillInset()}</Text>
  }
  const view = await render(<Probe />)
  expect(view.getByText('0')).toBeTruthy()

  await act(async () => { useWorkoutSession.setState({ session }) })
  expect(view.getByText('64')).toBeTruthy()
  const afterStart = renders

  await act(async () => {
    useWorkoutSession.getState().completeSet(0, 0)
    useWorkoutSession.getState().updateSet(0, 0, 'actual_reps', 10)
    useWorkoutSession.getState().addSet(0)
  })
  expect(renders).toBe(afterStart)

  await act(async () => { useWorkoutSession.getState().cancelSession() })
  expect(view.getByText('0')).toBeTruthy()
  await view.unmount()
})

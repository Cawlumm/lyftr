import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { pairWith, type ActiveSessionExercise } from '@lyftr/shared'
import { pairLive } from './pairLiveSession'
import { useWorkoutSession } from './lyftr'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() } }))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

const row = (id: number, group: number | null): ActiveSessionExercise =>
  ({ exercise_id: id, exercise: { id, name: `E${id}` }, notes: '', sets: [], superset_group: group }) as unknown as ActiveSessionExercise

const seed = (groups: (number | null)[]) => {
  const exercises = groups.map((g, i) => row(i, g))
  useWorkoutSession.getState().restoreSession({ name: 'T', started_at: new Date().toISOString(), exercises } as never)
  return exercises
}
const state = () => (useWorkoutSession.getState().session?.exercises ?? []).map((e) => [e.exercise_id, e.superset_group ?? null])

// pairLive must land where the pure pairWith says, since the sheet's promise is defined by it.
describe('pairLive matches pairWith', () => {
  const cases: { name: string; groups: (number | null)[]; i: number; j: number }[] = [
    { name: 'adjacent after', groups: [null, null, null], i: 0, j: 1 },
    { name: 'adjacent before', groups: [null, null, null], i: 1, j: 0 },
    { name: 'move up to a solo', groups: [null, null, null, null], i: 0, j: 3 },
    { name: 'move down to a solo', groups: [null, null, null, null], i: 3, j: 0 },
    { name: 'join a group at its end', groups: [1, 1, null, null], i: 1, j: 3 },
    { name: 'join a group mid-way', groups: [1, 1, 1, null, null], i: 1, j: 4 },
    { name: 'leave a larger group, mates stay grouped', groups: [null, 1, 1, 1, null], i: 0, j: 2 },
    { name: 'leave a pair, mate dissolves', groups: [null, null, 1, 1], i: 0, j: 2 },
    { name: 'lands beside former mates', groups: [null, null, 1, 1, 1], i: 0, j: 3 },
    { name: 'join a group mid-way from above', groups: [null, 1, 1, 1, null], i: 2, j: 0 },
    { name: 'two groups, pull from the other', groups: [1, 1, 2, 2, 2], i: 0, j: 3 },
    { name: 'already in one group', groups: [1, 1, null], i: 0, j: 1 },
  ]
  for (const c of cases) {
    it(c.name, () => {
      const rows = seed(c.groups)
      const want = pairWith(rows, c.i, c.j).map((e) => [e.exercise_id, e.superset_group ?? null])
      pairLive(c.i, c.j)
      expect(state()).toEqual(want)
    })
  }
})

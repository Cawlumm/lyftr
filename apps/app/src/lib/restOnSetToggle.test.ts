import { applyRestOnToggle } from './restOnSetToggle'
import { useSettingsStore, useWorkoutSession } from './lyftr'

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'))

const mkSet = (n: number) => ({ set_number: n, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false })
const mkEx = (rest_seconds?: number | null) => ({
  exercise_id: 1,
  exercise: { id: 1, name: 'Bench', muscle_group: 'Chest', equipment: 'barbell', category: 'strength', secondary_muscles: [], description: '', image_url: null },
  notes: '', rest_seconds, sets: [mkSet(1), mkSet(2)],
})

function seed(exRest: number | null | undefined, settings: { rest_enabled?: boolean; rest_seconds_default?: number }) {
  useWorkoutSession.setState({
    session: { name: 'T', started_at: new Date().toISOString(), exercises: [mkEx(exRest)] } as never,
  })
  useWorkoutSession.getState().clearRest()
  useSettingsStore.setState(({ settings: s }) => ({ settings: { ...s, rest_enabled: undefined, rest_seconds_default: undefined, ...settings } }))
}
const rest = () => { const s = useWorkoutSession.getState(); return [s.restExIdx, s.restSetIdx, s.restDurationSec] }

describe('applyRestOnToggle', () => {
  it('starts with the exercise rest first', () => {
    seed(45, { rest_enabled: true, rest_seconds_default: 120 })
    expect(applyRestOnToggle(0, 0)).toBe(false)
    expect(rest()).toEqual([0, 0, 45])
  })
  it('falls back to the default, then 90', () => {
    seed(null, { rest_enabled: true, rest_seconds_default: 120 })
    applyRestOnToggle(0, 0)
    expect(rest()).toEqual([0, 0, 120])
    seed(undefined, { rest_enabled: true })
    applyRestOnToggle(0, 1)
    expect(rest()).toEqual([0, 1, 90])
  })
  it('does nothing only when explicitly disabled; unset counts as on, like the settings UI', () => {
    seed(45, { rest_enabled: false })
    applyRestOnToggle(0, 0)
    expect(rest()).toEqual([null, null, null])
    seed(45, {})
    applyRestOnToggle(0, 0)
    expect(rest()).toEqual([0, 0, 45])
  })
  it('does nothing for a 0 second rest, even when a default exists', () => {
    seed(0, { rest_enabled: true, rest_seconds_default: 120 })
    applyRestOnToggle(0, 0)
    expect(rest()).toEqual([null, null, null])
  })
  it('un-tick clears only the resting set', () => {
    seed(45, { rest_enabled: true })
    applyRestOnToggle(0, 0)
    applyRestOnToggle(0, 1)
    expect(rest()).toEqual([0, 1, 45])
    expect(applyRestOnToggle(0, 0)).toBe(true)
    expect(rest()).toEqual([0, 1, 45])
    expect(applyRestOnToggle(0, 1)).toBe(true)
    expect(rest()).toEqual([null, null, null])
  })
  it('un-tick still clears when the timer has since been switched off', () => {
    seed(45, { rest_enabled: true })
    applyRestOnToggle(0, 0)
    useSettingsStore.setState(({ settings }) => ({ settings: { ...settings, rest_enabled: false } }))
    applyRestOnToggle(0, 0)
    expect(rest()).toEqual([null, null, null])
  })
})

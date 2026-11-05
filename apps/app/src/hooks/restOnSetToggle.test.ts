import { applyRestOnToggle, decideRest } from './restOnSetToggle'
import { useSettingsStore, useWorkoutSession } from '../lib/lyftr'

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'))

const base = { wasCompleted: false, enabled: true, exerciseRest: undefined, defaultRest: undefined, restingThisSet: false }

describe('decideRest', () => {
  it('starts with the exercise rest first', () => {
    expect(decideRest({ ...base, exerciseRest: 45, defaultRest: 120 })).toEqual({ kind: 'start', seconds: 45 })
  })
  it('falls back to the default, then 90', () => {
    expect(decideRest({ ...base, defaultRest: 120 })).toEqual({ kind: 'start', seconds: 120 })
    expect(decideRest(base)).toEqual({ kind: 'start', seconds: 90 })
  })
  it('does nothing when disabled', () => {
    expect(decideRest({ ...base, enabled: false, exerciseRest: 45 })).toEqual({ kind: 'none' })
    expect(decideRest({ ...base, enabled: undefined })).toEqual({ kind: 'none' })
  })
  it('does nothing for a 0 second rest, even when a default exists', () => {
    expect(decideRest({ ...base, exerciseRest: 0, defaultRest: 120 })).toEqual({ kind: 'none' })
  })
  it('un-tick clears only the resting set', () => {
    expect(decideRest({ ...base, wasCompleted: true, restingThisSet: true })).toEqual({ kind: 'clear' })
    expect(decideRest({ ...base, wasCompleted: true, restingThisSet: false })).toEqual({ kind: 'none' })
  })
  it('un-tick clears even when the timer has since been disabled', () => {
    expect(decideRest({ ...base, wasCompleted: true, enabled: false, restingThisSet: true })).toEqual({ kind: 'clear' })
  })
})

describe('applyRestOnToggle', () => {
  beforeEach(() => {
    useWorkoutSession.getState().clearRest()
    useSettingsStore.setState(({ settings }) => ({ settings: { ...settings, rest_enabled: true, rest_seconds_default: 60 } }))
  })
  it('starts rest for the ticked exercise/set, then un-tick of that set clears it', () => {
    applyRestOnToggle({ rest_seconds: null }, 1, 2, false)
    const s = useWorkoutSession.getState()
    expect([s.restExIdx, s.restSetIdx, s.restDurationSec]).toEqual([1, 2, 60])
    applyRestOnToggle({ rest_seconds: null }, 1, 0, true)
    expect(useWorkoutSession.getState().restSetIdx).toBe(2)
    applyRestOnToggle({ rest_seconds: null }, 1, 2, true)
    expect(useWorkoutSession.getState().restEndsAt).toBeNull()
  })
})

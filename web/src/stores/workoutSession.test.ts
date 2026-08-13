import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkoutSession, WORKOUT_SESSION_KEY, GYM_UI_KEY } from './workoutSession'
import { types } from '@lyftr/shared'

// The reducers (rest timer, buildPayload, auto-progression) are covered against an
// in-memory adapter in packages/shared/src/stores/workoutSession.test.ts. What is
// left here is the part only a browser can prove: that the shared factory bound to
// web's localStorage adapter actually reads and writes the real localStorage, under
// the same keys the previous web-only store used.
//
// That last point is the upgrade path. If these keys drifted, everyone mid-workout
// at deploy time would lose the session they were in.

const exercise = (): types.ActiveSessionExercise => ({
  exercise_id: 1,
  exercise: {
    id: 1, name: 'Bench Press', muscle_group: 'Chest', equipment: 'barbell',
    category: 'strength', secondary_muscles: [], description: '',
  },
  notes: '',
  sets: [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 100, completed: false }],
} as types.ActiveSessionExercise)

describe('useWorkoutSession — localStorage binding', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkoutSession.setState({ session: null })
  })

  it('writes a started session to localStorage under the historical key', () => {
    useWorkoutSession.getState().startSession('Push A', [exercise()])
    const raw = localStorage.getItem(WORKOUT_SESSION_KEY)
    expect(WORKOUT_SESSION_KEY).toBe('lyftr_active_session')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).name).toBe('Push A')
  })

  it('hydrate() restores a session written by a previous page load', async () => {
    localStorage.setItem(WORKOUT_SESSION_KEY, JSON.stringify({
      name: 'Restored', started_at: new Date().toISOString(), exercises: [exercise()],
    }))
    useWorkoutSession.setState({ session: null })
    await useWorkoutSession.getState().hydrate()
    expect(useWorkoutSession.getState().session?.name).toBe('Restored')
  })

  it('hydrate() survives a corrupt payload rather than throwing on load', async () => {
    // A half-written or hand-edited value must not break app startup — main.tsx
    // awaits this before the first render.
    localStorage.setItem(WORKOUT_SESSION_KEY, '{not json')
    useWorkoutSession.setState({ session: null })
    await expect(useWorkoutSession.getState().hydrate()).resolves.not.toThrow()
    expect(useWorkoutSession.getState().session).toBeNull()
  })

  it('cancelSession clears both persisted keys', () => {
    useWorkoutSession.getState().startSession('Push A', [exercise()])
    localStorage.setItem(GYM_UI_KEY, JSON.stringify({ phase: 'exercise' }))
    useWorkoutSession.getState().cancelSession()
    expect(localStorage.getItem(WORKOUT_SESSION_KEY)).toBeNull()
    expect(localStorage.getItem(GYM_UI_KEY)).toBeNull()
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkoutSession } from './workoutSession'

const store = () => useWorkoutSession.getState()

describe('workoutSession rest timer (ephemeral)', () => {
  beforeEach(() => {
    localStorage.clear()
    store().cancelSession()
  })

  it('startRest sets an absolute end timestamp + context', () => {
    const before = Date.now()
    store().startRest(90, 1, 2)
    const s = store()
    expect(s.restEndsAt!).toBeGreaterThanOrEqual(before + 90000 - 100)
    expect(s.restDurationSec).toBe(90)
    expect(s.restExIdx).toBe(1)
    expect(s.restSetIdx).toBe(2)
  })

  it('adjustRest extends, and clamps so it never goes below now', () => {
    store().startRest(60, 0, 0)
    const end1 = store().restEndsAt!
    store().adjustRest(15)
    expect(store().restEndsAt!).toBeGreaterThan(end1)
    store().adjustRest(-9999)
    expect(store().restEndsAt!).toBeGreaterThanOrEqual(Date.now() - 100)
  })

  it('clearRest + cancelSession null all rest fields', () => {
    store().startRest(60, 0, 0)
    store().clearRest()
    expect(store().restEndsAt).toBeNull()
    expect(store().restDurationSec).toBeNull()
    store().startRest(60, 0, 0)
    store().cancelSession()
    expect(store().restEndsAt).toBeNull()
  })

  it('pauseRest parks the remaining time and stops the live countdown', () => {
    store().startRest(60, 0, 0)
    store().pauseRest()
    const s = store()
    expect(s.restEndsAt).toBeNull() // live countdown frozen
    expect(s.restPausedRemainingMs!).toBeGreaterThan(59000)
    expect(s.restPausedRemainingMs!).toBeLessThanOrEqual(60000)
  })

  it('resumeRest restores a live end stamp from the parked time', () => {
    store().startRest(60, 0, 0)
    store().pauseRest()
    const parked = store().restPausedRemainingMs!
    store().resumeRest()
    const s = store()
    expect(s.restPausedRemainingMs).toBeNull()
    expect(s.restEndsAt!).toBeGreaterThanOrEqual(Date.now() + parked - 100)
  })

  it('adjustRest shifts the parked time while paused', () => {
    store().startRest(60, 0, 0)
    store().pauseRest()
    const parked = store().restPausedRemainingMs!
    store().adjustRest(15)
    expect(store().restPausedRemainingMs!).toBeGreaterThanOrEqual(parked + 15000 - 50)
    expect(store().restDurationSec).toBe(75)
  })

  it('startRest clears any prior paused state', () => {
    store().startRest(60, 0, 0)
    store().pauseRest()
    store().startRest(90, 1, 1)
    expect(store().restPausedRemainingMs).toBeNull()
    expect(store().restEndsAt).not.toBeNull()
  })

  it('adjustRest to 0 while paused finishes the rest (no stuck 0:00 · paused)', () => {
    store().startRest(10, 0, 0)
    store().pauseRest()
    store().adjustRest(-15) // parked 10s − 15s ≤ 0
    const s = store()
    expect(s.restPausedRemainingMs).toBeNull() // unpaused
    expect(s.restEndsAt!).toBeLessThanOrEqual(Date.now() + 1) // countdown reads 0 → done
  })

  it('removeExercise clears the rest so a stale positional restExIdx cannot mislead', () => {
    store().startSession('T', [
      { exercise_id: 1, exercise: { id: 1, name: 'A' }, notes: '', sets: [{ set_number: 1 }] },
      { exercise_id: 2, exercise: { id: 2, name: 'B' }, notes: '', sets: [{ set_number: 1 }] },
    ] as any)
    store().startRest(60, 0, 0)
    store().removeExercise(1)
    expect(store().restEndsAt).toBeNull()
    expect(store().restExIdx).toBeNull()
  })

  it('removeSet clears the rest (set indices shift)', () => {
    store().startSession('T', [
      { exercise_id: 1, exercise: { id: 1, name: 'A' }, notes: '', sets: [{ set_number: 1 }, { set_number: 2 }] },
    ] as any)
    store().startRest(60, 0, 1)
    store().removeSet(0, 0)
    expect(store().restEndsAt).toBeNull()
    expect(store().restSetIdx).toBeNull()
  })

  it('rest state is never written to localStorage (ephemeral)', () => {
    store().startSession('T', [])
    store().startRest(90, 0, 0)
    const raw = localStorage.getItem('lyftr_active_session')!
    expect(raw).not.toContain('restEndsAt')
    expect(raw).not.toContain('restDurationSec')
  })
})

describe('workoutSession buildPayload — auto-progression (#40)', () => {
  beforeEach(() => {
    localStorage.clear()
    store().cancelSession()
  })

  it('carries program_id and per-set program_set_id for a routine-sourced session', () => {
    store().startSession('Push A', [
      {
        exercise_id: 1, exercise: { id: 1, name: 'Bench' }, notes: '',
        sets: [
          { set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 5, actual_weight: 105, completed: true, program_set_id: 11 },
          { set_number: 2, target_reps: 5, target_weight: 100, actual_reps: 6, actual_weight: 100, completed: true, program_set_id: 12 },
        ],
      },
    ] as any, 7)
    const payload = store().buildPayload()
    expect(payload.program_id).toBe(7)
    expect(payload.exercises[0].sets[0].program_set_id).toBe(11)
    expect(payload.exercises[0].sets[1].program_set_id).toBe(12)
    // logged actuals are what the backend compares against the target
    expect(payload.exercises[0].sets[0].weight).toBe(105)
    expect(payload.exercises[0].sets[1].reps).toBe(6)
  })

  it('freestyle session sends null program_id and null program_set_id (no progression)', () => {
    store().startSession('Freestyle', [
      { exercise_id: 1, exercise: { id: 1, name: 'Bench' }, notes: '',
        sets: [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 0, actual_weight: 0, completed: true }] },
    ] as any)
    const payload = store().buildPayload()
    expect(payload.program_id).toBeNull()
    expect(payload.exercises[0].sets[0].program_set_id).toBeNull()
  })

  it('blank actuals fall back to target so logged == target → no false progression', () => {
    store().startSession('Push A', [
      { exercise_id: 1, exercise: { id: 1, name: 'Bench' }, notes: '',
        sets: [{ set_number: 1, target_reps: 5, target_weight: 100, actual_reps: 0, actual_weight: 0, completed: true, program_set_id: 11 }] },
    ] as any, 7)
    const payload = store().buildPayload()
    expect(payload.exercises[0].sets[0].reps).toBe(5)
    expect(payload.exercises[0].sets[0].weight).toBe(100)
  })
})

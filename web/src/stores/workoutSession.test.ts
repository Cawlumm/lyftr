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

  it('rest state is never written to localStorage (ephemeral)', () => {
    store().startSession('T', [])
    store().startRest(90, 0, 0)
    const raw = localStorage.getItem('lyftr_active_session')!
    expect(raw).not.toContain('restEndsAt')
    expect(raw).not.toContain('restDurationSec')
  })
})

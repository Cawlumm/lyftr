import { calcVolume, countWorkingSets, exerciseVolume } from './workout'
import type { Set, Workout } from '../types'

const set = (over: Partial<Set> = {}): Set =>
  ({ id: 1, set_number: 1, reps: 10, weight: 100, is_warmup: false, ...over } as Set)

describe('exerciseVolume', () => {
  it('sums reps × weight', () => {
    expect(exerciseVolume([set(), set({ reps: 5, weight: 200 })])).toBe(2000)
  })

  it('excludes warm-up sets, matching the backend filter', () => {
    // backend/stores/workout.go: SUM(s.reps * s.weight) ... AND s.is_warmup = 0
    expect(exerciseVolume([set(), set({ is_warmup: true, reps: 10, weight: 999 })])).toBe(1000)
  })

  it('treats a missing reps or weight as 0 instead of poisoning the sum with NaN', () => {
    // One NaN would make the whole workout's volume NaN — a hard react-native-svg
    // crash on mobile, silently dropped chart geometry on web.
    expect(exerciseVolume([set({ reps: undefined as never }), set()])).toBe(1000)
    expect(exerciseVolume([set({ weight: null as never }), set()])).toBe(1000)
    expect(Number.isFinite(exerciseVolume([set({ reps: undefined as never })]))).toBe(true)
  })

  it('handles a missing set list', () => {
    expect(exerciseVolume(undefined)).toBe(0)
    expect(exerciseVolume(null)).toBe(0)
    expect(exerciseVolume([])).toBe(0)
  })
})

describe('calcVolume', () => {
  it('sums across every exercise', () => {
    const w = { exercises: [{ sets: [set()] }, { sets: [set({ reps: 5, weight: 100 })] }] } as Workout
    expect(calcVolume(w)).toBe(1500)
  })

  it('handles a workout with no exercises or no workout at all', () => {
    expect(calcVolume({ exercises: [] } as unknown as Workout)).toBe(0)
    expect(calcVolume({} as Workout)).toBe(0)
    expect(calcVolume(undefined)).toBe(0)
  })
})

describe('countWorkingSets', () => {
  it('counts sets across every exercise', () => {
    const w = { exercises: [{ sets: [set(), set()] }, { sets: [set()] }] } as Workout
    expect(countWorkingSets(w)).toBe(3)
  })

  it('excludes warm-ups, so the count agrees with the volume beside it', () => {
    // A card showing "12 sets · 4,200 lb" where the volume came from 8 of them is a
    // self-contradiction; whatever the filter is, both figures must apply it.
    const w = { exercises: [{ sets: [set(), set({ is_warmup: true })] }] } as Workout
    expect(countWorkingSets(w)).toBe(1)
    expect(calcVolume(w)).toBe(1000)
  })

  it('handles missing exercises or sets', () => {
    expect(countWorkingSets(undefined)).toBe(0)
    expect(countWorkingSets({} as Workout)).toBe(0)
    expect(countWorkingSets({ exercises: [{ sets: undefined }] } as unknown as Workout)).toBe(0)
  })
})

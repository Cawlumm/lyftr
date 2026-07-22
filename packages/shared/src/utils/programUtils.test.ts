import {
  activeSessionExercisesForDay, allExercises, dayLabel, hasWorkoutExercises, isDayStartable, programExerciseCount,
  programSetCount, sessionNameForDay, todaysDay, workoutDays,
} from './programUtils'
import type { Program, ProgramDay } from '../types'

const day = (overrides: Partial<ProgramDay> = {}): ProgramDay => ({
  id: 1,
  order_index: 0,
  is_rest_day: false,
  name: '',
  exercises: [],
  ...overrides,
})

const program = (days: ProgramDay[], currentDayIndex = 0): Program => ({
  id: 1,
  name: 'PPL',
  created_at: '2026-01-01T00:00:00Z',
  days,
  current_day_index: currentDayIndex,
})

describe('workoutDays', () => {
  it('filters rest days out and preserves order', () => {
    const p = program([
      day({ id: 1, order_index: 0 }),
      day({ id: 2, order_index: 1, is_rest_day: true }),
      day({ id: 3, order_index: 2 }),
    ])
    expect(workoutDays(p).map((d) => d.id)).toEqual([1, 3])
  })

  it('tolerates a program with undefined days', () => {
    expect(workoutDays({ ...program([]), days: undefined as any })).toEqual([])
  })
})

describe('todaysDay', () => {
  it('returns the entry at current_day_index', () => {
    const p = program([day({ id: 1, order_index: 0 }), day({ id: 2, order_index: 1 })], 1)
    expect(todaysDay(p)?.id).toBe(2)
  })

  it('is undefined for a program with no days', () => {
    expect(todaysDay(program([]))).toBeUndefined()
  })
})

describe('dayLabel', () => {
  it('prefers the trimmed custom name', () => {
    expect(dayLabel(day({ name: '  Push Day  ' }), 0)).toBe('Push Day')
  })

  it('falls back to Rest Day / Day N+1 — idx must be order_index, not a filtered loop index', () => {
    expect(dayLabel(day({ is_rest_day: true }), 3)).toBe('Rest Day')
    // A workout day at cycle position 2 must label "Day 3" even when it's e.g. the
    // second entry of a rest-filtered list (the classic loop-index bug).
    expect(dayLabel(day({ order_index: 2 }), 2)).toBe('Day 3')
  })

  it('whitespace-only names fall back too', () => {
    expect(dayLabel(day({ name: '   ' }), 0)).toBe('Day 1')
  })
})

describe('counts + flattening', () => {
  const ex = (id: number, sets: number) => ({
    exercise_id: id,
    exercise: { id, name: `E${id}` } as any,
    sets: Array.from({ length: sets }, (_, i) => ({ set_number: i + 1, target_reps: 5, target_weight: 100 })),
  })
  const p = program([
    day({ id: 1, order_index: 0, exercises: [ex(1, 2), ex(2, 3)] as any }),
    day({ id: 2, order_index: 1, is_rest_day: true }),
    day({ id: 3, order_index: 2, exercises: [ex(3, 1)] as any }),
  ])

  it('programExerciseCount sums across all days', () => {
    expect(programExerciseCount(p)).toBe(3)
  })

  it('programSetCount sums sets across all days', () => {
    expect(programSetCount(p)).toBe(6)
  })

  it('allExercises flattens in day order (so a suggestion is visible whatever day is selected)', () => {
    expect(allExercises(p).map((e) => e.exercise_id)).toEqual([1, 2, 3])
  })
})

describe('activeSessionExercisesForDay', () => {
  it('seeds actuals from targets and links each set to its program_set_id (#40)', () => {
    const d = day({
      exercises: [{
        exercise_id: 9,
        exercise: { id: 9, name: 'Bench' } as any,
        notes: 'slow eccentric',
        rest_seconds: 120,
        sets: [{ id: 41, set_number: 1, target_reps: 5, target_weight: 135 }],
      }] as any,
    })
    const [ex] = activeSessionExercisesForDay(d)
    expect(ex.exercise_id).toBe(9)
    expect(ex.notes).toBe('slow eccentric')
    expect(ex.rest_seconds).toBe(120)
    expect(ex.sets[0]).toEqual({
      set_number: 1,
      target_reps: 5,
      target_weight: 135,
      actual_reps: 5,
      actual_weight: 135,
      completed: false,
      program_set_id: 41,
    })
  })

  it('a rest/empty day yields no exercises', () => {
    expect(activeSessionExercisesForDay(day({ is_rest_day: true }))).toEqual([])
    expect(activeSessionExercisesForDay({ ...day(), exercises: undefined as any })).toEqual([])
  })
})

describe('isDayStartable', () => {
  const withExercise = day({ exercises: [{ exercise_id: 1 }] as any })

  it('true only for a workout day with at least one exercise', () => {
    expect(isDayStartable(withExercise)).toBe(true)
  })

  it('false for a rest day, even with exercises somehow present', () => {
    expect(isDayStartable({ ...withExercise, is_rest_day: true })).toBe(false)
  })

  it('false for a workout day with no exercises', () => {
    expect(isDayStartable(day({ exercises: [] }))).toBe(false)
  })

  it('false for undefined (as todaysDay() returns for a dayless program)', () => {
    expect(isDayStartable(undefined)).toBe(false)
  })
})

describe('sessionNameForDay', () => {
  it('is just the program name for a single-day program', () => {
    const p = program([day({ order_index: 0 })])
    expect(sessionNameForDay(p, p.days![0])).toBe('PPL')
  })

  it('appends the day label once a program has more than one day', () => {
    const d = day({ order_index: 1, name: 'Pull A' })
    const p = program([day({ order_index: 0 }), d])
    expect(sessionNameForDay(p, d)).toBe('PPL — Pull A')
  })
})

describe('hasWorkoutExercises', () => {
  it('true when some workout day has an exercise', () => {
    expect(hasWorkoutExercises([
      day({ exercises: [] }),
      day({ exercises: [{ exercise_id: 1 }] as any }),
    ])).toBe(true)
  })

  it('false when every day is empty or a rest day', () => {
    expect(hasWorkoutExercises([day({ exercises: [] }), day({ is_rest_day: true, exercises: [{ exercise_id: 1 }] as any })])).toBe(false)
  })

  it('false for an empty list', () => {
    expect(hasWorkoutExercises([])).toBe(false)
  })
})

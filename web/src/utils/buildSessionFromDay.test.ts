import { describe, it, expect } from 'vitest'
import { buildSessionFromDay, trainingDays, sessionNameForDay } from './buildSessionFromDay'
import * as types from '../types'

const ex = (id: number): types.Exercise => ({
  id,
  name: `Exercise ${id}`,
  muscle_group: 'chest',
  secondary_muscles: [],
  category: 'strength',
  equipment: '',
  description: '',
  image_url: '',
  video_url: '',
})

const day = (over: Partial<types.ProgramDay>): types.ProgramDay => ({
  name: 'Day',
  order_index: 0,
  is_rest_day: false,
  exercises: [],
  ...over,
})

const program = (over: Partial<types.Program>): types.Program => ({
  id: 1,
  name: 'PPL',
  created_at: '',
  days: [],
  exercises: [],
  ...over,
})

describe('buildSessionFromDay', () => {
  it('maps a day exercise into a session exercise with prefilled actuals', () => {
    const d = day({
      exercises: [
        {
          exercise_id: 10,
          exercise: ex(10),
          rest_seconds: 120,
          sets: [{ id: 55, set_number: 1, target_reps: 5, target_weight: 185 }],
        },
      ],
    })

    const result = buildSessionFromDay(d)

    expect(result).toHaveLength(1)
    expect(result[0].exercise_id).toBe(10)
    expect(result[0].rest_seconds).toBe(120)
    const set = result[0].sets[0]
    expect(set.actual_reps).toBe(5)
    expect(set.actual_weight).toBe(185)
    expect(set.completed).toBe(false)
    // program_set_id linkage preserved for auto-progression (#40)
    expect(set.program_set_id).toBe(55)
  })

  it('returns an empty list for a day with no exercises', () => {
    expect(buildSessionFromDay(day({ exercises: [] }))).toEqual([])
  })
})

describe('trainingDays', () => {
  it('filters out rest days, preserving order', () => {
    const p = program({
      days: [
        day({ name: 'Upper', order_index: 0 }),
        day({ name: 'Rest', order_index: 1, is_rest_day: true }),
        day({ name: 'Lower', order_index: 2 }),
      ],
    })
    expect(trainingDays(p).map(d => d.name)).toEqual(['Upper', 'Lower'])
  })
})

describe('sessionNameForDay', () => {
  it('uses the bare program name for a single-training-day program', () => {
    const d = day({ name: 'Day 1' })
    const p = program({ name: 'Full Body', days: [d] })
    expect(sessionNameForDay(p, d)).toBe('Full Body')
  })

  it('tags the day for a multi-day program', () => {
    const upper = day({ name: 'Upper', order_index: 0 })
    const lower = day({ name: 'Lower', order_index: 1 })
    const p = program({ name: 'U/L', days: [upper, lower] })
    expect(sessionNameForDay(p, lower)).toBe('U/L: Lower')
  })
})

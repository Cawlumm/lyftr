import { describe, it, expect } from 'vitest'
import { tallyExercises, tallyDay, tallyProgram } from './muscleVolume'
import * as types from '../types'

function ex(muscle: string, secondary: string[] = []): types.ProgramExercise {
  return {
    exercise_id: 1,
    exercise: {
      id: 1,
      name: 'X',
      muscle_group: muscle,
      secondary_muscles: secondary,
      category: 'strength',
      equipment: '',
      description: '',
      image_url: '',
      video_url: '',
    },
    sets: [],
  }
}

function day(over: Partial<types.ProgramDay>): types.ProgramDay {
  return { name: 'D', order_index: 0, is_rest_day: false, exercises: [], ...over }
}

describe('tallyExercises', () => {
  it('counts one exercise as primary x1 and collects secondaries', () => {
    const v = tallyExercises([ex('chest', ['triceps', 'shoulders'])])
    expect(v.primary).toEqual([{ muscle: 'chest', count: 1 }])
    expect(v.secondary).toEqual(['shoulders', 'triceps'])
  })

  it('counts the same primary twice as x2', () => {
    const v = tallyExercises([ex('chest'), ex('chest')])
    expect(v.primary).toEqual([{ muscle: 'chest', count: 2 }])
  })

  it('orders primary by count desc then name asc', () => {
    const v = tallyExercises([ex('legs'), ex('chest'), ex('chest'), ex('back'), ex('back')])
    // chest:2, back:2, legs:1 -> ties (chest/back) broken alphabetically
    expect(v.primary).toEqual([
      { muscle: 'back', count: 2 },
      { muscle: 'chest', count: 2 },
      { muscle: 'legs', count: 1 },
    ])
  })

  it('skips blank primary muscles', () => {
    const v = tallyExercises([ex(''), ex('chest')])
    expect(v.primary).toEqual([{ muscle: 'chest', count: 1 }])
  })

  it('dedupes secondaries across exercises and drops any that are also a primary', () => {
    const v = tallyExercises([ex('chest', ['triceps']), ex('triceps', ['chest'])])
    // triceps is a primary here, so it must not also appear in secondary
    expect(v.primary.map(p => p.muscle).sort()).toEqual(['chest', 'triceps'])
    expect(v.secondary).toEqual([])
  })

  it('is case-insensitive and trims', () => {
    const v = tallyExercises([ex('Chest'), ex(' chest ')])
    expect(v.primary).toEqual([{ muscle: 'chest', count: 2 }])
  })
})

describe('tallyDay', () => {
  it('returns empty volume for a rest day', () => {
    expect(tallyDay(day({ is_rest_day: true, exercises: [ex('chest')] }))).toEqual({ primary: [], secondary: [] })
  })

  it('tallies a training day exercises', () => {
    expect(tallyDay(day({ exercises: [ex('back'), ex('back')] })).primary).toEqual([{ muscle: 'back', count: 2 }])
  })
})

describe('tallyProgram', () => {
  it('runs the total across training days, ignoring rest days', () => {
    const days = [
      day({ name: 'Day 1', exercises: [ex('chest')] }),
      day({ name: 'Rest', is_rest_day: true, exercises: [] }),
      day({ name: 'Day 3', exercises: [ex('chest'), ex('legs')] }),
    ]
    // chest appears in day 1 and day 3 -> x2 overall
    const v = tallyProgram(days)
    expect(v.primary).toEqual([
      { muscle: 'chest', count: 2 },
      { muscle: 'legs', count: 1 },
    ])
  })
})

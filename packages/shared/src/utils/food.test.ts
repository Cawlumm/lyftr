import { entryToResult, savedToResult, scaleServing } from './food'
import type { FoodLog, SavedFood } from '../types'

const log = (over: Partial<FoodLog> = {}): FoodLog => ({
  id: 1, user_id: 1, name: 'Oats', meal: 'breakfast',
  calories: 300, protein: 10, carbs: 54, fat: 6, fiber: 8,
  servings: 1, serving_size: '100g', logged_at: '', logged_on: '2026-08-10',
  ...over,
} as FoodLog)

describe('entryToResult', () => {
  it('divides a logged entry back down to one serving', () => {
    const r = entryToResult(log({ servings: 3, calories: 900, protein: 30, carbs: 150, fat: 15, fiber: 9 }))
    expect(r.calories).toBe(300)
    expect(r.protein).toBe(10)
    expect(r.carbs).toBe(50)
    expect(r.fat).toBe(5)
    expect(r.fiber).toBe(3)
  })

  it('passes a single-serving entry through unchanged', () => {
    expect(entryToResult(log({ servings: 1 })).calories).toBe(300)
  })

  it('treats 0 servings as 1 rather than dividing by zero', () => {
    // A 0 would make every macro Infinity and silently poison the detail view.
    const r = entryToResult(log({ servings: 0 }))
    expect(r.calories).toBe(300)
    expect(Number.isFinite(r.protein)).toBe(true)
  })

  it('defaults missing fiber to 0 instead of NaN', () => {
    expect(entryToResult(log({ fiber: undefined, servings: 2 })).fiber).toBe(0)
  })
})

describe('savedToResult', () => {
  it('maps across untouched — a saved food is already per serving', () => {
    const s = { id: 1, user_id: 1, name: 'Whey', brand: 'X', calories: 120, protein: 24, carbs: 3, fat: 1, fiber: 0, serving_size: '1 scoop' } as SavedFood
    const r = savedToResult(s)
    expect(r).toMatchObject({ name: 'Whey', brand: 'X', calories: 120, protein: 24, source: 'saved' })
  })
})

describe('scaleServing', () => {
  const result = (over = {}) => ({
    name: 'Oats', calories: 300, protein: 10, carbs: 54, fat: 6, fiber: 8,
    serving_size: '100g', source: 'saved' as const, ...over,
  })

  it('scales every macro by the serving count', () => {
    const p = scaleServing(result(), 2)
    expect(p).toMatchObject({ calories: 600, protein: 20, carbs: 108, fat: 12, fiber: 16, servings: 2 })
  })

  it('round-trips with entryToResult — the pair must agree or a re-log drifts', () => {
    const original = result()
    const logged = scaleServing(original, 3)
    const back = entryToResult({ ...logged, fiber: logged.fiber } as never)
    expect(back.calories).toBeCloseTo(original.calories, 5)
    expect(back.protein).toBeCloseTo(original.protein, 5)
    expect(back.fiber).toBeCloseTo(original.fiber, 5)
  })

  it('rounds to the app-wide 0.1 precision', () => {
    expect(scaleServing(result({ calories: 33.333 }), 3).calories).toBe(100)
    expect(scaleServing(result({ protein: 1.005 }), 1).protein).toBe(1)
  })

  it('defaults a missing name, fiber, serving_size and image_url', () => {
    const p = scaleServing(result({ name: '', fiber: undefined, serving_size: undefined, image_url: undefined }), 1)
    expect(p).toMatchObject({ name: 'Custom entry', fiber: 0, serving_size: '', image_url: '' })
  })
})

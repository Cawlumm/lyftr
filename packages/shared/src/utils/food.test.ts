import { entryToResult, findSavedFood, isDailyStats, normaliseFoodKey, savedToResult, scaleServing } from './food'
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

const saved = (over: Partial<SavedFood> = {}): SavedFood => ({
  id: 1, user_id: 1, name: 'Chicken Breast', brand: 'Tesco',
  calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0,
  serving_size: '100g', barcode: '', created_at: '',
  ...over,
} as SavedFood)

// The Recent tab is built on entryToResult, and its rows are matched against Favorites
// by name + brand. If brand doesn't survive the log round-trip, a branded favourite shows
// an unfilled star on Recent and starring it creates a second, brandless row.
describe('brand survives the log round-trip', () => {
  it('entryToResult keeps the brand', () => {
    expect(entryToResult(log({ brand: 'Tesco' } as never)).brand).toBe('Tesco')
  })

  it('scaleServing carries the brand onto the logged payload', () => {
    const picked = savedToResult(saved({ brand: 'Fage' }))
    expect(scaleServing(picked, 2).brand).toBe('Fage')
  })

  it('an unbranded food stays an empty string, matching what the API stores', () => {
    expect(scaleServing({ name: 'Water', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, serving_size: '1 glass', source: 'manual' }, 1).brand).toBe('')
  })
})

describe('findSavedFood', () => {
  it('matches on name and brand', () => {
    const list = [saved({ id: 7 })]
    expect(findSavedFood(list, { name: 'Chicken Breast', brand: 'Tesco' })?.id).toBe(7)
  })

  it('treats a different brand as a different product', () => {
    const list = [saved({ brand: 'Tesco' })]
    expect(findSavedFood(list, { name: 'Chicken Breast', brand: "Sainsbury's" })).toBeUndefined()
  })

  // The API stores '' for an unbranded food; a search result can carry undefined. These
  // are the same bookmark, and treating them as different is how a duplicate slips past
  // the client check straight into the server's unique index.
  it('treats a missing brand and an empty brand as the same', () => {
    const list = [saved({ id: 3, brand: '' })]
    expect(findSavedFood(list, { name: 'Chicken Breast' })?.id).toBe(3)
    expect(findSavedFood(list, { name: 'Chicken Breast', brand: '' })?.id).toBe(3)
  })

  // Matched exactly, mirroring the server's UNIQUE index. If the client folded case and
  // the server did not, the client would hide a bookmark the server would happily add.
  it('does not fold case', () => {
    const list = [saved()]
    expect(findSavedFood(list, { name: 'chicken breast', brand: 'Tesco' })).toBeUndefined()
  })

  it('returns undefined against an empty list', () => {
    expect(findSavedFood([], { name: 'Chicken Breast', brand: 'Tesco' })).toBeUndefined()
  })
})

// The server trims before storing, so the client has to compare on the same terms —
// otherwise a search result carrying "Oats " reads as different from the stored "Oats",
// the star shows unfilled next to a food that is already favourited, and tapping it asks
// the server to create a row it will refuse as a duplicate.
describe('findSavedFood normalisation', () => {
  const list = [saved({ id: 9, name: 'Oats', brand: 'Quaker' })]

  it.each([
    ['trailing space', 'Oats ', 'Quaker'],
    ['leading space', ' Oats', 'Quaker'],
    ['both ends', '  Oats  ', 'Quaker'],
    ['tab and newline', '\tOats\n', 'Quaker'],
    ['padded brand', 'Oats', ' Quaker '],
  ])('matches across %s', (_label, name, brand) => {
    expect(findSavedFood(list, { name, brand })?.id).toBe(9)
  })

  // Case stays significant, matching the UNIQUE(user_id, name, brand) index. Folding it
  // here would hide a favourite the server would happily create.
  it('does not fold case', () => {
    expect(findSavedFood(list, { name: 'oats', brand: 'Quaker' })).toBeUndefined()
  })

  it('still separates genuinely different brands', () => {
    expect(findSavedFood(list, { name: 'Oats ', brand: 'Lidl' })).toBeUndefined()
  })

  it('treats a whitespace-only brand as unbranded', () => {
    const unbranded = [saved({ id: 4, name: 'Water', brand: '' })]
    expect(findSavedFood(unbranded, { name: 'Water', brand: '   ' })?.id).toBe(4)
  })
})

describe('normaliseFoodKey', () => {
  it('trims and tolerates undefined', () => {
    expect(normaliseFoodKey('  Oats  ')).toBe('Oats')
    expect(normaliseFoodKey(undefined)).toBe('')
  })
})

describe('isDailyStats', () => {
  const ok = {
    date: '2026-08-29', total_calories: 1840, total_protein: 128,
    total_carbs: 190, total_fat: 61, total_fiber: 22, workout_count: 1,
  }

  it('accepts the real payload', () => {
    expect(isDailyStats(ok)).toBe(true)
  })

  // A server that adds a field must not make an older client call the answer broken.
  it('accepts a payload carrying fields it does not know about', () => {
    expect(isDailyStats({ ...ok, total_alcohol: 3 })).toBe(true)
  })

  // Each of these arrived with a 200, so no catch ever fired for them. The dashboard
  // rendered NaN and the food screen rendered 0 — a measurement — for every one.
  it.each([
    ['a string', 'nonsense'],
    ['a number', 42],
    ['an array', [1, 2, 3]],
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['a partial object', { total_calories: 1840 }],
    ['NaN in a number field', { ...ok, total_calories: NaN }],
    ['a stringified number', { ...ok, total_calories: '1840' }],
  ])('rejects %s', (_label, value) => {
    expect(isDailyStats(value)).toBe(false)
  })
})

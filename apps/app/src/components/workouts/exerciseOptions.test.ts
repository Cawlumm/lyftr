import { CUSTOM_EXERCISE_CATEGORIES, CUSTOM_EXERCISE_EQUIPMENT, CUSTOM_EXERCISE_MUSCLES, i18n } from '@lyftr/shared'
import { CATEGORY_OPTIONS, DEFAULT_CATEGORY, DEFAULT_EQUIPMENT, EQUIPMENT_OPTIONS, MUSCLE_GROUPS, MUSCLE_VALUES } from './exerciseOptions'

const values = (o: readonly { value: string }[]) => o.map((x) => x.value).sort()

describe('exercise options', () => {
  it('equipment, categories and muscles are exactly what the server accepts, each once', () => {
    expect(values(EQUIPMENT_OPTIONS)).toEqual([...CUSTOM_EXERCISE_EQUIPMENT].sort())
    expect(values(CATEGORY_OPTIONS)).toEqual([...CUSTOM_EXERCISE_CATEGORIES].sort())
    expect([...MUSCLE_VALUES].sort()).toEqual([...CUSTOM_EXERCISE_MUSCLES].sort())
  })

  it('the defaults are options', () => {
    expect(EQUIPMENT_OPTIONS.map((o) => o.value)).toContain(DEFAULT_EQUIPMENT)
    expect(CATEGORY_OPTIONS.map((o) => o.value)).toContain(DEFAULT_CATEGORY)
  })

  it('every label key and group heading is in the catalog', () => {
    for (const o of [...EQUIPMENT_OPTIONS, ...CATEGORY_OPTIONS, ...MUSCLE_GROUPS]) expect(i18n.exists(o.labelKey)).toBe(true)
    for (const m of MUSCLE_VALUES) expect(i18n.exists(`exercises.muscle.${m}`)).toBe(true)
  })
})

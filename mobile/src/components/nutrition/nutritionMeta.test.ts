import { i18n } from '@lyftr/shared'
import { MACRO_TEXT, MEAL_COLORS, MEAL_LABELS, MEALS, mealLabel } from './nutritionMeta'

// This suite also acts as a canary: nutritionMeta imports lucide-react-native (ESM), so
// a green run here proves jest.config's transformIgnorePatterns whitelist is correct.
describe('nutritionMeta', () => {
  afterEach(async () => { await i18n.changeLanguage('en') })

  it('labels every meal', () => {
    expect(MEAL_LABELS.breakfast).toBe('Breakfast')
    expect(Object.keys(MEAL_LABELS).sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snacks'])
    expect(MEALS.map(mealLabel)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks'])
  })

  it('labels every meal in Spanish after a language switch', async () => {
    await i18n.changeLanguage('es')
    expect(MEALS.map(mealLabel)).toEqual(['Desayuno', 'Almuerzo', 'Cena', 'Snacks'])
    expect(MEAL_LABELS.dinner).toBe('Cena')
  })

  it('has a color for every meal', () => {
    for (const meal of MEALS) {
      expect(MEAL_COLORS[meal]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('exposes the macro text palette', () => {
    expect(MACRO_TEXT.protein).toBe('#34d399')
    expect(MACRO_TEXT.carbs).toBe('#fbbf24')
    expect(MACRO_TEXT.fat).toBe('#a78bfa')
  })
})

import { i18n } from '@lyftr/shared'
import { MACRO_TEXT, MEAL_COLORS, MEALS, mealLabel, mealMessage } from './nutritionMeta'

// This suite also acts as a canary: nutritionMeta imports lucide-react-native (ESM), so
// a green run here proves jest.config's transformIgnorePatterns whitelist is correct.
describe('nutritionMeta', () => {
  afterEach(async () => { await i18n.changeLanguage('en') })

  it('labels every meal', () => {
    expect(MEALS.map(mealLabel)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks'])
  })

  it('labels every meal in Spanish after a language switch', async () => {
    await i18n.changeLanguage('es')
    expect(MEALS.map(mealLabel)).toEqual(['Desayuno', 'Almuerzo', 'Cena', 'Snacks'])
  })

  it('renders an unknown meal blank, not as its catalog key', () => {
    expect(mealLabel('xyz' as never)).toBe('')
  })

  it('words the added-to toast at render, so a language switch re-translates it', async () => {
    const toast = { key: 'food.diary.addedTo' as const, params: { meal: 'lunch' } }
    expect(mealMessage(toast)).toBe('Added to Lunch')
    await i18n.changeLanguage('es')
    expect(mealMessage(toast)).toBe('Agregado a Almuerzo')
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

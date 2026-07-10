import { MACRO_TEXT, MEAL_COLORS, MEAL_LABELS, MEALS } from './nutritionMeta'

// This suite also acts as a canary: nutritionMeta imports lucide-react-native (ESM), so
// a green run here proves jest.config's transformIgnorePatterns whitelist is correct.
describe('nutritionMeta', () => {
  it('labels every meal', () => {
    expect(MEAL_LABELS.breakfast).toBe('Breakfast')
    expect(Object.keys(MEAL_LABELS).sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snacks'])
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

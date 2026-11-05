import { Coffee, Cookie, Moon, Sun, type LucideIcon } from '../ui/icons'
import { i18n, uiMessage, type FoodLog, type UiMessage } from '@lyftr/shared'

// Meal + macro presentation constants, ported 1:1 from web (Food.tsx / LogFood.tsx +
// utils/macroColors.ts). Web expressed colors as Tailwind text-* classes; on native
// icon/SVG colors must be hex props, so the class names are resolved to their exact
// Tailwind hex values here.

export type Meal = FoodLog['meal']

export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks']

// A meal outside the list renders blank, not as the raw catalog key.
export const mealLabel = (meal: Meal): string => (MEALS.includes(meal) ? i18n.t(`food.meal.${meal}`) : '')

// A toast that names a meal carries the slug in params.meal and is worded here, at render,
// so a language switch while it is on screen re-translates it.
export const mealMessage = (m: UiMessage): string =>
  uiMessage(m.params?.meal ? { ...m, params: { ...m.params, meal: mealLabel(m.params.meal as Meal) } } : m)

export const MEAL_ICONS: Record<Meal, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snacks: Cookie,
}

// text-amber-400 / text-yellow-400 / text-indigo-400 / text-pink-400 (Tailwind hex).
export const MEAL_COLORS: Record<Meal, string> = {
  breakfast: '#fbbf24',
  lunch: '#facc15',
  dinner: '#818cf8',
  snacks: '#f472b6',
}

// Text in the meal's tint or a macro's, on the 10% tints they sit in. The 400s above are
// 1.3 to 2.3:1 there on a light surface; the 800 rung clears AA (4.5:1) on every one. The
// dark entries are the 400s, which clear it on dark. Icons, dots and bars keep the 400s:
// graphics need only 3:1 and are not read as text.
export const MEAL_INK = {
  light: { breakfast: '#92400e', lunch: '#854d0e', dinner: '#3730a3', snacks: '#9d174d' },
  dark: MEAL_COLORS,
} as const

// The ring / chart / mini-bar palette. Re-exported so this module stays the one place
// nutrition screens import their colours from; the values live in @lyftr/shared because
// web charts with the same three.
export { MACRO_COLORS } from '@lyftr/shared'

// Per-macro accent used for the small tabular P/C/F figures on rows + the detail grid
// (web: text-emerald-400 / text-amber-400 / text-violet-400 — the -400 shades).
export const MACRO_TEXT = { protein: '#34d399', carbs: '#fbbf24', fat: '#a78bfa' } as const
export const MACRO_INK = {
  light: { protein: '#065f46', carbs: '#92400e', fat: '#5b21b6' },
  dark: MACRO_TEXT,
} as const

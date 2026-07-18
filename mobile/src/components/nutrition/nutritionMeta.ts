import { Coffee, Cookie, Moon, Sun, type LucideIcon } from 'lucide-react-native'
import type { FoodLog } from '@lyftr/shared'

// Meal + macro presentation constants, ported 1:1 from web (Food.tsx / LogFood.tsx +
// utils/macroColors.ts). Web expressed colors as Tailwind text-* classes; on native
// icon/SVG colors must be hex props, so the class names are resolved to their exact
// Tailwind hex values here.

export type Meal = FoodLog['meal']

export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks']

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
}

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

// utils/macroColors.ts — the ring / chart / mini-bar palette.
export const MACRO_COLORS = { protein: '#10b981', carbs: '#f59e0b', fat: '#8b5cf6' } as const

// Per-macro accent used for the small tabular P/C/F figures on rows + the detail grid
// (web: text-emerald-400 / text-amber-400 / text-violet-400 — the -400 shades).
export const MACRO_TEXT = { protein: '#34d399', carbs: '#fbbf24', fat: '#a78bfa' } as const

import {
  BicepsFlexed, Cable, CircleDot, Cog, Cylinder, Dumbbell, Ellipsis, HeartPulse, Medal, PersonStanding, Spline,
  StretchHorizontal, Trophy, Volleyball, Waves, Weight, Zap,
} from '../ui/icons'
import type { LucideIcon } from '../ui/icons'

// What the custom-exercise form offers. Adding an option is one line here (plus its label in the
// locale files); exerciseOptions.test.ts holds these to the slug lists the server validates against.

export const EQUIPMENT_OPTIONS = [
  { value: 'body-only', icon: PersonStanding, labelKey: 'exercises.equipment.body-only' },
  { value: 'barbell', icon: Dumbbell, labelKey: 'exercises.equipment.barbell' },
  { value: 'dumbbell', icon: BicepsFlexed, labelKey: 'exercises.equipment.dumbbell' },
  { value: 'machine', icon: Cog, labelKey: 'exercises.equipment.machine' },
  { value: 'cable', icon: Cable, labelKey: 'exercises.equipment.cable' },
  { value: 'kettlebells', icon: Weight, labelKey: 'exercises.equipment.kettlebells' },
  { value: 'bands', icon: Spline, labelKey: 'exercises.equipment.bands' },
  { value: 'medicine-ball', icon: Volleyball, labelKey: 'exercises.equipment.medicine-ball' },
  { value: 'e-z-curl-bar', icon: Waves, labelKey: 'exercises.equipment.e-z-curl-bar' },
  { value: 'exercise-ball', icon: CircleDot, labelKey: 'exercises.equipment.exercise-ball' },
  { value: 'foam-roll', icon: Cylinder, labelKey: 'exercises.equipment.foam-roll' },
  { value: 'other', icon: Ellipsis, labelKey: 'exercises.equipment.other' },
] as const satisfies readonly { value: string; icon: LucideIcon; labelKey: string }[]

export const CATEGORY_OPTIONS = [
  { value: 'strength', icon: Dumbbell, labelKey: 'exercises.category.strength' },
  { value: 'stretching', icon: StretchHorizontal, labelKey: 'exercises.category.stretching' },
  { value: 'plyometrics', icon: Zap, labelKey: 'exercises.category.plyometrics' },
  { value: 'strongman', icon: Weight, labelKey: 'exercises.category.strongman' },
  { value: 'powerlifting', icon: Trophy, labelKey: 'exercises.category.powerlifting' },
  { value: 'cardio', icon: HeartPulse, labelKey: 'exercises.category.cardio' },
  { value: 'olympic-weightlifting', icon: Medal, labelKey: 'exercises.category.olympic-weightlifting' },
] as const satisfies readonly { value: string; icon: LucideIcon; labelKey: string }[]

// Muscles, grouped by body region (the Body map's list view headings). Every muscle is in exactly one.
export const MUSCLE_GROUPS = [
  { key: 'chestShoulders', labelKey: 'exercises.custom.form.group.chestShoulders', muscles: ['chest', 'shoulders', 'traps', 'neck'] },
  { key: 'arms', labelKey: 'exercises.custom.form.group.arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { key: 'back', labelKey: 'exercises.custom.form.group.back', muscles: ['lats', 'middle-back', 'lower-back'] },
  { key: 'core', labelKey: 'exercises.custom.form.group.core', muscles: ['abdominals'] },
  { key: 'legs', labelKey: 'exercises.custom.form.group.legs', muscles: ['glutes', 'quadriceps', 'hamstrings', 'calves', 'adductors', 'abductors'] },
] as const

export const MUSCLE_VALUES: readonly string[] = MUSCLE_GROUPS.flatMap((g) => g.muscles)

export const DEFAULT_EQUIPMENT = 'body-only'
export const DEFAULT_CATEGORY = 'strength'

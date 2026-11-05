import { resolveMuscleSlugs } from '@lyftr/shared'

// Mobile's half of exercise presentation: the RN tint table and the
// react-native-body-highlighter slug table. The equipment and muscle labels and the lookup
// rule are shared — see packages/shared/src/utils/exerciseUtils.ts for why these two are not.
//
// The text tint is a hex, not a class, because AppText always resolves a default
// text-colour class and two colour classes on one Text leave the winner to stylesheet
// order (see CONVENTIONS.md's font-size warning) — an inline style wins deterministically.
// The dark hexes are Tailwind's own *-400 values, the light ones its *-800.
// `border` carries web's muscleColorBordered() border class for the picker badges;
// borderless badges (detail screen) simply don't apply it.
export { categoryLabel, equipmentLabel, muscleLabel } from '@lyftr/shared'

export interface MuscleTint {
  /** NativeWind class for the badge background (bg only — no text class). */
  chip: string
  /** NativeWind border-color class (web's muscleColorBordered variant). */
  border: string
  /** Badge text color on a dark surface - apply via AppText's inline `style`. */
  text: string
  /** Badge text color on a light surface: the 400 above is 1.3 to 2.3:1 on the /20 tint there. */
  light: string
}

const MUSCLE_COLORS: Record<string, MuscleTint> = {
  chest:      { chip: 'bg-red-500/20',    border: 'border-red-500/30',    text: '#f87171', light: '#991b1b' },
  back:       { chip: 'bg-blue-500/20',   border: 'border-blue-500/30',   text: '#60a5fa', light: '#1e40af' },
  shoulders:  { chip: 'bg-orange-500/20', border: 'border-orange-500/30', text: '#fb923c', light: '#9a3412' },
  biceps:     { chip: 'bg-purple-500/20', border: 'border-purple-500/30', text: '#c084fc', light: '#6b21a8' },
  triceps:    { chip: 'bg-pink-500/20',   border: 'border-pink-500/30',   text: '#f472b6', light: '#9d174d' },
  legs:       { chip: 'bg-green-500/20',  border: 'border-green-500/30',  text: '#4ade80', light: '#166534' },
  quadriceps: { chip: 'bg-green-500/20',  border: 'border-green-500/30',  text: '#4ade80', light: '#166534' },
  hamstrings: { chip: 'bg-teal-500/20',   border: 'border-teal-500/30',   text: '#2dd4bf', light: '#115e59' },
  glutes:     { chip: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: '#facc15', light: '#854d0e' },
  calves:     { chip: 'bg-lime-500/20',   border: 'border-lime-500/30',   text: '#a3e635', light: '#3f6212' },
  abdominals: { chip: 'bg-amber-500/20',  border: 'border-amber-500/30',  text: '#fbbf24', light: '#92400e' },
  core:       { chip: 'bg-amber-500/20',  border: 'border-amber-500/30',  text: '#fbbf24', light: '#92400e' },
  forearms:   { chip: 'bg-cyan-500/20',   border: 'border-cyan-500/30',   text: '#22d3ee', light: '#155e75' },
  traps:      { chip: 'bg-indigo-500/20', border: 'border-indigo-500/30', text: '#818cf8', light: '#3730a3' },
  lats:       { chip: 'bg-sky-500/20',    border: 'border-sky-500/30',    text: '#38bdf8', light: '#075985' },
  'lower-back':  { chip: 'bg-blue-500/20',    border: 'border-blue-500/30',    text: '#60a5fa', light: '#1e40af' },
  'middle-back': { chip: 'bg-blue-500/20',    border: 'border-blue-500/30',    text: '#60a5fa', light: '#1e40af' },
  neck:       { chip: 'bg-rose-500/20',    border: 'border-rose-500/30',    text: '#fb7185', light: '#9f1239' },
  adductors:  { chip: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: '#34d399', light: '#065f46' },
  abductors:  { chip: 'bg-violet-500/20',  border: 'border-violet-500/30',  text: '#a78bfa', light: '#5b21b6' },
}

// The ink for a chip in the current theme. Tailwind's 800 rung clears AA (4.5:1) on every
// tint over the light surfaces (5.5 to 7.1:1); the 400s clear it on the dark ones.
export function muscleInk(tint: MuscleTint | null, isDark: boolean): string | undefined {
  return tint ? (isDark ? tint.text : tint.light) : undefined
}

// null → caller renders the muted fallback (bg-surface-muted chip + colors.txMuted).
export function muscleColor(m: string): MuscleTint | null {
  return MUSCLE_COLORS[m?.toLowerCase()] ?? null
}

// react-native-body-highlighter's slug set: a single 'deltoids' (no front/back split)
// and no 'abductors'/'middle-back', so those remap to the nearest available part. Slugs
// stay plain strings (the diagram component casts to the library's Slug type) so this
// util doesn't depend on the library.
const MUSCLE_TO_BODY_SLUG: Record<string, string[]> = {
  chest: ['chest'],
  back: ['upper-back', 'lower-back'],
  'upper back': ['upper-back'],
  'middle back': ['upper-back'], // RN lib has no 'middle-back'
  'middle-back': ['upper-back'],
  'lower back': ['lower-back'],
  'lower-back': ['lower-back'],
  lats: ['upper-back'],
  shoulders: ['deltoids'],
  deltoids: ['deltoids'],
  'anterior deltoid': ['deltoids'],
  'front deltoid': ['deltoids'],
  'posterior deltoid': ['deltoids'],
  'rear deltoid': ['deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  forearm: ['forearm'],
  traps: ['trapezius'],
  trapezius: ['trapezius'],
  neck: ['neck'],
  rhomboids: ['upper-back'],
  legs: ['quadriceps', 'hamstring', 'calves', 'gluteal'],
  quadriceps: ['quadriceps'],
  hamstrings: ['hamstring'],
  hamstring: ['hamstring'],
  glutes: ['gluteal'],
  gluteal: ['gluteal'],
  calves: ['calves'],
  adductors: ['adductors'],
  abductors: ['gluteal'], // hip abductor ≈ glute; RN lib has no 'abductors'
  'hip flexors': ['adductors'],
  abdominals: ['abs'],
  abs: ['abs'],
  core: ['abs', 'obliques'],
  obliques: ['obliques'],
  'serratus anterior': ['abs'],
  'spinal erectors': ['lower-back'],
  erectors: ['lower-back'],
}

export const muscleToBodySlugs = (m: string): string[] => resolveMuscleSlugs(m, MUSCLE_TO_BODY_SLUG)

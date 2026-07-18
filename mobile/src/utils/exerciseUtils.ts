// Port of web/src/utils/exerciseUtils.ts (MUSCLE_COLORS / muscleColor /
// EQUIPMENT_LABEL) — keep in sync.
// RN adaptation: the web returns "bg-* text-* border-*" class strings; here the text
// tint is an inline-style hex instead, because AppText always resolves a default
// text-color class and two color classes on one Text leave the winner to stylesheet
// order (see CONVENTIONS.md's font-size warning) — an inline style wins
// deterministically. The hexes are Tailwind's own *-400 palette values, identical to
// the web's text-*-400 classes; like the brand literals they are theme-independent.
// `border` carries the web muscleColorBordered() border class for the picker badges;
// borderless badges (detail screen) simply don't apply it.

export interface MuscleTint {
  /** NativeWind class for the badge background (bg only — no text class). */
  chip: string
  /** NativeWind border-color class (web's muscleColorBordered variant). */
  border: string
  /** Badge text color — apply via AppText's inline `style`. */
  text: string
}

export const MUSCLE_COLORS: Record<string, MuscleTint> = {
  chest:      { chip: 'bg-red-500/20',    border: 'border-red-500/30',    text: '#f87171' },
  back:       { chip: 'bg-blue-500/20',   border: 'border-blue-500/30',   text: '#60a5fa' },
  shoulders:  { chip: 'bg-orange-500/20', border: 'border-orange-500/30', text: '#fb923c' },
  biceps:     { chip: 'bg-purple-500/20', border: 'border-purple-500/30', text: '#c084fc' },
  triceps:    { chip: 'bg-pink-500/20',   border: 'border-pink-500/30',   text: '#f472b6' },
  legs:       { chip: 'bg-green-500/20',  border: 'border-green-500/30',  text: '#4ade80' },
  quadriceps: { chip: 'bg-green-500/20',  border: 'border-green-500/30',  text: '#4ade80' },
  hamstrings: { chip: 'bg-teal-500/20',   border: 'border-teal-500/30',   text: '#2dd4bf' },
  glutes:     { chip: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: '#facc15' },
  calves:     { chip: 'bg-lime-500/20',   border: 'border-lime-500/30',   text: '#a3e635' },
  abdominals: { chip: 'bg-amber-500/20',  border: 'border-amber-500/30',  text: '#fbbf24' },
  core:       { chip: 'bg-amber-500/20',  border: 'border-amber-500/30',  text: '#fbbf24' },
  forearms:   { chip: 'bg-cyan-500/20',   border: 'border-cyan-500/30',   text: '#22d3ee' },
  traps:      { chip: 'bg-indigo-500/20', border: 'border-indigo-500/30', text: '#818cf8' },
  lats:       { chip: 'bg-sky-500/20',    border: 'border-sky-500/30',    text: '#38bdf8' },
}

// Port of web EQUIPMENT_LABEL — keep in sync.
export const EQUIPMENT_LABEL: Record<string, string> = {
  'body only':     'Bodyweight',
  'barbell':       'Barbell',
  'dumbbell':      'Dumbbell',
  'machine':       'Machine',
  'cable':         'Cable',
  'kettlebells':   'Kettlebell',
  'bands':         'Bands',
  'medicine ball': 'Med Ball',
  'other':         'Other',
  'foam roll':     'Foam Roll',
}

// null → caller renders the muted fallback (bg-surface-muted chip + colors.txMuted).
export function muscleColor(m: string): MuscleTint | null {
  return MUSCLE_COLORS[m?.toLowerCase()] ?? null
}

// Maps our exercise muscle names → react-native-body-highlighter's `Slug` set for the
// gym exercise-info muscle diagram. Adapted from web's MUSCLE_TO_BODY_SLUG, but the RN
// library's slug model differs from react-body-highlighter: it has a single 'deltoids'
// (no front/back split) and no 'abductors'/'middle-back', so those remap to the nearest
// available part. Slugs are kept as plain strings (the diagram component casts to the
// library's Slug type) so this util doesn't depend on the library.
const MUSCLE_TO_BODY_SLUG: Record<string, string[]> = {
  chest: ['chest'],
  back: ['upper-back', 'lower-back'],
  'upper back': ['upper-back'],
  'middle back': ['upper-back'], // RN lib has no 'middle-back'
  'lower back': ['lower-back'],
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

// Body-diagram slugs for a muscle name (exact match, then partial), or [] if unknown.
// Mirrors web muscleToBodySlugs.
export function muscleToBodySlugs(m: string): string[] {
  const key = m?.toLowerCase().trim()
  if (!key) return []
  if (MUSCLE_TO_BODY_SLUG[key]) return MUSCLE_TO_BODY_SLUG[key]
  for (const [k, v] of Object.entries(MUSCLE_TO_BODY_SLUG)) {
    if (key.includes(k) || k.includes(key)) return v
  }
  return []
}

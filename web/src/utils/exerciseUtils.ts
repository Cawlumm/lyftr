export const MUSCLE_COLORS: Record<string, string> = {
  chest:      'bg-red-500/20 text-red-400 border-red-500/30',
  back:       'bg-blue-500/20 text-blue-400 border-blue-500/30',
  shoulders:  'bg-orange-500/20 text-orange-400 border-orange-500/30',
  biceps:     'bg-purple-500/20 text-purple-400 border-purple-500/30',
  triceps:    'bg-pink-500/20 text-pink-400 border-pink-500/30',
  legs:       'bg-green-500/20 text-green-400 border-green-500/30',
  quadriceps: 'bg-green-500/20 text-green-400 border-green-500/30',
  hamstrings: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  glutes:     'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  calves:     'bg-lime-500/20 text-lime-400 border-lime-500/30',
  abdominals: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  core:       'bg-amber-500/20 text-amber-400 border-amber-500/30',
  forearms:   'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  traps:      'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  lats:       'bg-sky-500/20 text-sky-400 border-sky-500/30',
}

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

export function muscleColor(m: string): string {
  const full = MUSCLE_COLORS[m?.toLowerCase()] || 'bg-surface-muted text-tx-muted border-surface-border'
  return full.split(' ').filter(c => !c.startsWith('border-')).join(' ')
}

export function muscleColorBordered(m: string): string {
  return MUSCLE_COLORS[m?.toLowerCase()] || 'bg-surface-muted text-tx-muted border-surface-border'
}

// Maps our muscle group names + common secondary muscle names → react-body-highlighter slugs
const MUSCLE_TO_BODY_SLUG: Record<string, string[]> = {
  chest: ['chest'],
  back: ['upper-back', 'lower-back'],
  shoulders: ['front-deltoids', 'back-deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  legs: ['quadriceps', 'hamstring', 'calves', 'gluteal'],
  quadriceps: ['quadriceps'],
  hamstrings: ['hamstring'],
  hamstring: ['hamstring'],
  glutes: ['gluteal'],
  gluteal: ['gluteal'],
  calves: ['calves'],
  abdominals: ['abs'],
  abs: ['abs'],
  core: ['abs', 'obliques'],
  obliques: ['obliques'],
  forearms: ['forearm'],
  forearm: ['forearm'],
  traps: ['trapezius'],
  trapezius: ['trapezius'],
  lats: ['upper-back'],
  neck: ['neck'],
  // secondary muscle names from exercise DB
  'anterior deltoid': ['front-deltoids'],
  'front deltoid': ['front-deltoids'],
  'posterior deltoid': ['back-deltoids'],
  'rear deltoid': ['back-deltoids'],
  deltoids: ['front-deltoids', 'back-deltoids'],
  'serratus anterior': ['abs'],
  rhomboids: ['upper-back'],
  'spinal erectors': ['lower-back'],
  erectors: ['lower-back'],
  'lower back': ['lower-back'],
  'upper back': ['upper-back'],
  'hip flexors': ['adductor'],
  adductors: ['adductor'],
  abductors: ['abductors'],
}

export function muscleToBodySlugs(m: string): string[] {
  const key = m?.toLowerCase().trim()
  if (!key) return []
  if (MUSCLE_TO_BODY_SLUG[key]) return MUSCLE_TO_BODY_SLUG[key]
  // partial match fallback
  for (const [k, v] of Object.entries(MUSCLE_TO_BODY_SLUG)) {
    if (key.includes(k) || k.includes(key)) return v
  }
  return []
}

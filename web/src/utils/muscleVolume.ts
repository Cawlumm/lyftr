export interface MuscleCount {
  muscle: string
  count: number
}

export interface Volume {
  // Primary muscle tallies, ordered by count desc then name asc.
  primary: MuscleCount[]
  // Distinct secondary ("also worked") muscles, sorted. Not counted.
  secondary: string[]
}

// Minimal structural shapes so both the API types (ProgramExercise/ProgramDay) and the
// builder's local BuilderExercise/BuilderDay satisfy these without conversion.
interface ExerciseLike {
  exercise?: { muscle_group?: string; secondary_muscles?: string[] }
}
interface DayLike {
  is_rest_day: boolean
  exercises: ExerciseLike[]
}

// tallyExercises counts each exercise as +1 to its primary muscle_group and collects
// (dedupes) its secondary muscles. Blank primary muscles are skipped. Counting is
// per-exercise, not per-set, so a 4-set bench press is still chest x1.
export function tallyExercises(exercises: ExerciseLike[]): Volume {
  const counts = new Map<string, number>()
  const secondary = new Set<string>()

  for (const ex of exercises || []) {
    const primary = ex.exercise?.muscle_group?.trim().toLowerCase()
    if (primary) counts.set(primary, (counts.get(primary) || 0) + 1)
    for (const sec of ex.exercise?.secondary_muscles || []) {
      const s = sec?.trim().toLowerCase()
      if (s) secondary.add(s)
    }
  }

  const primary: MuscleCount[] = [...counts.entries()]
    .map(([muscle, count]) => ({ muscle, count }))
    .sort((a, b) => b.count - a.count || a.muscle.localeCompare(b.muscle))

  // A muscle that is a primary somewhere in this scope shouldn't also be listed as a
  // lesser "also worked" — the primary count already represents it.
  for (const p of primary) secondary.delete(p.muscle)

  return { primary, secondary: [...secondary].sort() }
}

export function tallyDay(day: DayLike): Volume {
  if (day.is_rest_day) return { primary: [], secondary: [] }
  return tallyExercises(day.exercises || [])
}

// tallyProgram combines every training day into one running total.
export function tallyProgram(days: DayLike[]): Volume {
  const all = (days || [])
    .filter(d => !d.is_rest_day)
    .flatMap(d => d.exercises || [])
  return tallyExercises(all)
}

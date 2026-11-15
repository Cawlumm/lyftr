import type { Exercise } from '@lyftr/shared'

// The create page is a route, so it cannot be handed a callback. The caller registers what it
// wants done with the new exercise and passes the returned id in the route params; the page
// resolves it on save. Module-level and in memory on purpose: a reload loses it, and the page
// then falls back to opening the exercise instead of handing it to a caller that is gone.
const pending = new Map<string, (exercise: Exercise) => void>()

export function requestExerciseCreate(onCreated: (exercise: Exercise) => void): string {
  // Time and a random tail: a counter would restart on a web reload and could match a stale id.
  const id = `create-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  pending.set(id, onCreated)
  return id
}

export function resolveExerciseCreate(id: string, exercise: Exercise): boolean {
  const onCreated = pending.get(id)
  if (!onCreated) return false
  pending.delete(id)
  onCreated(exercise)
  return true
}

export const hasExerciseCreate = (id: string): boolean => pending.has(id)

export function cancelExerciseCreate(id: string): void {
  pending.delete(id)
}

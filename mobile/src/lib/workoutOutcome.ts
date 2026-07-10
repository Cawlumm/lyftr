import { create } from 'zustand'
import type { ActiveSession } from '@lyftr/shared'

// A one-shot signal handed from the session teardown (gym overlay / active list) to the
// Workouts list, which shows a confirmation toast on arrival. The overlay unmounts and we
// navigate, so a tiny store is the courier. 'discarded' carries the session snapshot so the
// toast's "Tap to undo" can restore it verbatim. Mobile-only (UI feedback, never persisted).
export type WorkoutOutcome =
  | { kind: 'saved'; workoutId: number }
  | { kind: 'discarded'; session: ActiveSession }
  | null

interface OutcomeStore {
  outcome: WorkoutOutcome
  setOutcome: (o: WorkoutOutcome) => void
  clear: () => void
}

export const useWorkoutOutcome = create<OutcomeStore>((set) => ({
  outcome: null,
  setOutcome: (outcome) => set({ outcome }),
  clear: () => set({ outcome: null }),
}))

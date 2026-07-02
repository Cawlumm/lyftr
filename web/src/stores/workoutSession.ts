import { create } from 'zustand'
import * as types from '../types'

const SESSION_KEY = 'lyftr_active_session'
const GYM_UI_KEY = 'lyftr_gym_ui'

function saveLocal(session: types.ActiveSession | null) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

function loadLocal(): types.ActiveSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

type GymPhase = 'overview' | 'exercise-info' | 'exercise'

type GymUiState = { phase: GymPhase; exIdx: number; setIdx: number }

function saveGymUi(s: GymUiState) {
  localStorage.setItem(GYM_UI_KEY, JSON.stringify(s))
}

function loadGymUi(): GymUiState {
  try {
    const raw = localStorage.getItem(GYM_UI_KEY)
    return raw ? JSON.parse(raw) : { phase: 'overview', exIdx: 0, setIdx: 0 }
  } catch {
    return { phase: 'overview', exIdx: 0, setIdx: 0 }
  }
}

interface WorkoutSessionStore {
  session: types.ActiveSession | null
  gymOpen: boolean
  gymPhase: GymPhase
  gymExIdx: number
  gymSetIdx: number
  startSession: (name: string, exercises: types.ActiveSessionExercise[], programId?: number) => void
  updateSet: (exIdx: number, setIdx: number, field: 'actual_reps' | 'actual_weight', val: number) => void
  completeSet: (exIdx: number, setIdx: number) => void
  updateExerciseNotes: (exIdx: number, notes: string) => void
  addSet: (exIdx: number) => void
  removeSet: (exIdx: number, setIdx: number) => void
  addExercise: (ex: types.ActiveSessionExercise) => void
  removeExercise: (exIdx: number) => void
  buildPayload: () => any
  cancelSession: () => void
  openGym: () => void
  minimizeGym: () => void
  setGymState: (phase: GymPhase, exIdx: number, setIdx: number) => void
  setExerciseRest: (exIdx: number, secs: number) => void
  // Rest timer — ephemeral (never persisted). Survives minimize/restore via the
  // module singleton; evaporates on full refresh by design (an absolute timestamp
  // must not outlive the session moment).
  restEndsAt: number | null
  restDurationSec: number | null
  restExIdx: number | null
  restSetIdx: number | null
  // When paused, restEndsAt is nulled and the frozen remaining time is parked here
  // (ms). This is the single "paused" flag: paused iff restPausedRemainingMs != null.
  restPausedRemainingMs: number | null
  startRest: (durationSec: number, exIdx: number, setIdx: number) => void
  adjustRest: (deltaSec: number) => void
  pauseRest: () => void
  resumeRest: () => void
  clearRest: () => void
}

const _savedGymUi = loadGymUi()

// All rest-timer fields nulled — the single "no active rest" state, reused wherever
// rest is cleared (clearRest, cancelSession, and structural edits that invalidate the
// positional restExIdx/restSetIdx).
const CLEARED_REST = {
  restEndsAt: null, restDurationSec: null, restExIdx: null, restSetIdx: null, restPausedRemainingMs: null,
} as const

export const useWorkoutSession = create<WorkoutSessionStore>((set, get) => ({
  session: loadLocal(),
  gymOpen: false,
  gymPhase: _savedGymUi.phase,
  gymExIdx: _savedGymUi.exIdx,
  gymSetIdx: _savedGymUi.setIdx,
  ...CLEARED_REST,

  startRest: (durationSec, exIdx, setIdx) =>
    set({ restEndsAt: Date.now() + durationSec * 1000, restDurationSec: durationSec, restExIdx: exIdx, restSetIdx: setIdx, restPausedRemainingMs: null }),
  adjustRest: (deltaSec) => set(state => {
    const nextDuration = Math.max(1, (state.restDurationSec ?? 0) + deltaSec)
    // Adjusting while paused shifts the parked remaining time, not a live end stamp.
    if (state.restPausedRemainingMs != null) {
      const nextMs = state.restPausedRemainingMs + deltaSec * 1000
      // Adjusted to zero while paused → finish it: unpause into the completed
      // state (restEndsAt = now → countdown reads 0 → done → auto-dismiss), so it
      // never sticks at "0:00 · paused" with no completion path.
      if (nextMs <= 0) return { restPausedRemainingMs: null, restEndsAt: Date.now(), restDurationSec: nextDuration }
      return { restPausedRemainingMs: nextMs, restDurationSec: nextDuration }
    }
    if (state.restEndsAt == null) return {}
    return {
      restEndsAt: Math.max(Date.now(), state.restEndsAt + deltaSec * 1000),
      restDurationSec: nextDuration,
    }
  }),
  // Freeze the countdown: park the remaining time and null the live end stamp so
  // useCountdown (here and in the minimized-gym mount) stops ticking.
  pauseRest: () => set(state => {
    if (state.restEndsAt == null || state.restPausedRemainingMs != null) return {}
    return { restPausedRemainingMs: Math.max(0, state.restEndsAt - Date.now()), restEndsAt: null }
  }),
  resumeRest: () => set(state => {
    if (state.restPausedRemainingMs == null) return {}
    return { restEndsAt: Date.now() + state.restPausedRemainingMs, restPausedRemainingMs: null }
  }),
  clearRest: () => set({ ...CLEARED_REST }),

  openGym: () => set({ gymOpen: true }),
  minimizeGym: () => set({ gymOpen: false }),
  setGymState: (gymPhase, gymExIdx, gymSetIdx) => {
    saveGymUi({ phase: gymPhase, exIdx: gymExIdx, setIdx: gymSetIdx })
    set({ gymPhase, gymExIdx, gymSetIdx })
  },

  startSession: (name, exercises, programId) => {
    const session: types.ActiveSession = {
      name,
      started_at: new Date().toISOString(),
      exercises,
      program_id: programId,
    }
    saveLocal(session)
    set({ session })
  },

  updateSet: (exIdx, setIdx, field, val) => {
    const session = get().session
    if (!session) return
    const exercises = session.exercises.map((ex, i) =>
      i !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: val } : s),
      }
    )
    const updated = { ...session, exercises }
    saveLocal(updated)
    set({ session: updated })
  },

  completeSet: (exIdx, setIdx) => {
    const session = get().session
    if (!session) return
    const exercises = session.exercises.map((ex, i) =>
      i !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, j) => j === setIdx ? { ...s, completed: !s.completed } : s),
      }
    )
    const updated = { ...session, exercises }
    saveLocal(updated)
    set({ session: updated })
  },

  updateExerciseNotes: (exIdx, notes) => {
    const session = get().session
    if (!session) return
    const exercises = session.exercises.map((ex, i) => i !== exIdx ? ex : { ...ex, notes })
    const updated = { ...session, exercises }
    saveLocal(updated)
    set({ session: updated })
  },

  setExerciseRest: (exIdx, secs) => {
    const session = get().session
    if (!session) return
    const exercises = session.exercises.map((ex, i) => i !== exIdx ? ex : { ...ex, rest_seconds: secs })
    const updated = { ...session, exercises }
    saveLocal(updated)
    set({ session: updated })
  },

  addSet: (exIdx) => {
    const session = get().session
    if (!session) return
    const exercises = session.exercises.map((ex, i) => {
      if (i !== exIdx) return ex
      const last = ex.sets[ex.sets.length - 1]
      return {
        ...ex,
        sets: [...ex.sets, {
          set_number: ex.sets.length + 1,
          target_reps: last?.target_reps ?? 0,
          target_weight: last?.target_weight ?? 0,
          actual_reps: last?.actual_reps ?? 0,
          actual_weight: last?.actual_weight ?? 0,
          completed: false,
        }],
      }
    })
    const updated = { ...session, exercises }
    saveLocal(updated)
    set({ session: updated })
  },

  removeSet: (exIdx, setIdx) => {
    const session = get().session
    if (!session) return
    const exercises = session.exercises.map((ex, i) => {
      if (i !== exIdx) return ex
      const newSets = ex.sets
        .filter((_, j) => j !== setIdx)
        .map((s, j) => ({ ...s, set_number: j + 1 }))
      return { ...ex, sets: newSets }
    })
    const updated = { ...session, exercises }
    saveLocal(updated)
    // Removing a set shifts set indices, invalidating the positional restSetIdx — cancel
    // the (ephemeral) rest rather than let it point at the wrong set.
    set({ session: updated, ...CLEARED_REST })
  },

  addExercise: (ex) => {
    const session = get().session
    if (!session) return
    const updated = { ...session, exercises: [...session.exercises, ex] }
    saveLocal(updated)
    set({ session: updated })
  },

  removeExercise: (exIdx) => {
    const session = get().session
    if (!session) return
    const updated = { ...session, exercises: session.exercises.filter((_, i) => i !== exIdx) }
    saveLocal(updated)
    // filter() shifts exercise indices, invalidating the positional restExIdx — cancel
    // the (ephemeral) rest so it can't collapse controls on the wrong exercise.
    set({ session: updated, ...CLEARED_REST })
  },

  buildPayload: () => {
    const session = get().session
    if (!session) return null
    const durationSec = Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
    return {
      name: session.name,
      notes: '',
      duration: durationSec,
      started_at: session.started_at,
      program_id: session.program_id ?? null, // lets the backend auto-progress the routine (#40)
      exercises: session.exercises.map(ex => ({
        exercise_id: ex.exercise_id,
        notes: ex.notes,
        rest_seconds: ex.rest_seconds,
        sets: ex.sets.map((s, i) => ({
          set_number: i + 1,
          reps: s.actual_reps || s.target_reps,
          weight: s.actual_weight || s.target_weight,
          program_set_id: s.program_set_id ?? null, // which routine target this set can progress (#40)
        })),
      })),
    }
  },

  cancelSession: () => {
    saveLocal(null)
    localStorage.removeItem(GYM_UI_KEY)
    set({
      session: null, gymOpen: false, gymPhase: 'overview', gymExIdx: 0, gymSetIdx: 0,
      ...CLEARED_REST,
    })
  },
}))

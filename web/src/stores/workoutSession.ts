import { create } from 'zustand'
import * as types from '../types'
import { activeSessionAPI } from '../services/api'

const SESSION_KEY = 'lyftr_active_session'
const DEVICE_KEY = 'lyftr_device_id'
const CANCEL_KEY = 'lyftr_session_cancelled'

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

interface WorkoutSessionStore {
  session: types.ActiveSession | null
  syncing: boolean
  startSession: (name: string, exercises: types.ActiveSessionExercise[], programId?: number) => void
  updateSet: (exIdx: number, setIdx: number, field: 'actual_reps' | 'actual_weight', val: number) => void
  completeSet: (exIdx: number, setIdx: number) => void
  addSet: (exIdx: number) => void
  removeSet: (exIdx: number, setIdx: number) => void
  addExercise: (ex: types.ActiveSessionExercise) => void
  removeExercise: (exIdx: number) => void
  buildPayload: () => any
  cancelSession: () => void
  restoreFromServer: () => Promise<void>
}

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

// Debounced backend sync — 2s after last change
let syncTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSync(session: types.ActiveSession) {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    activeSessionAPI.save(session).catch(() => {})
  }, 2000)
}

function flushSync(session: types.ActiveSession) {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
  return activeSessionAPI.save(session)
}

export const useWorkoutSession = create<WorkoutSessionStore>((set, get) => ({
  session: loadLocal(),
  syncing: false,

  startSession: (name, exercises, programId) => {
    localStorage.removeItem(CANCEL_KEY)
    const session: types.ActiveSession = {
      name,
      started_at: new Date().toISOString(),
      exercises,
      program_id: programId,
      device_id: getDeviceId(),
    }
    saveLocal(session)
    set({ session })
    flushSync(session).catch(() => {})
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
    scheduleSync(updated)
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
    flushSync(updated).catch(() => {})
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
    scheduleSync(updated)
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
    set({ session: updated })
    scheduleSync(updated)
  },

  addExercise: (ex) => {
    const session = get().session
    if (!session) return
    const updated = { ...session, exercises: [...session.exercises, ex] }
    saveLocal(updated)
    set({ session: updated })
    scheduleSync(updated)
  },

  removeExercise: (exIdx) => {
    const session = get().session
    if (!session) return
    const updated = { ...session, exercises: session.exercises.filter((_, i) => i !== exIdx) }
    saveLocal(updated)
    set({ session: updated })
    scheduleSync(updated)
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
      exercises: session.exercises.map(ex => ({
        exercise_id: ex.exercise_id,
        notes: ex.notes,
        sets: ex.sets.map((s, i) => ({
          set_number: i + 1,
          reps: s.actual_reps || s.target_reps,
          weight: s.actual_weight || s.target_weight,
        })),
      })),
    }
  },

  cancelSession: () => {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
    saveLocal(null)
    localStorage.setItem(CANCEL_KEY, '1')
    set({ session: null })
    activeSessionAPI.clear().catch(() => {})
  },

  restoreFromServer: async () => {
    const local = loadLocal()
    if (local) return
    // User explicitly cancelled — don't restore, retry the server clear
    if (localStorage.getItem(CANCEL_KEY)) {
      try {
        await activeSessionAPI.clear()
        localStorage.removeItem(CANCEL_KEY)
      } catch {
        // Keep CANCEL_KEY so next restore retries the clear
      }
      return
    }
    try {
      const serverSession = await activeSessionAPI.get()
      if (serverSession && serverSession.device_id === getDeviceId()) {
        saveLocal(serverSession)
        set({ session: serverSession })
      }
    } catch {
      // offline or unauthenticated — nothing to restore
    }
  },
}))

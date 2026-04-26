import { create } from 'zustand'
import * as types from '../types'
import { userAPI } from '../services/api'

const LAYOUT_KEY = 'lyftr_workout_layout'

interface SettingsStore {
  settings: types.UserSettings
  loaded: boolean
  fetch: () => Promise<void>
  update: (patch: Partial<types.UserSettings>) => Promise<void>
  setWorkoutLayout: (layout: 'list' | 'gym') => void
  reset: () => void
}

const DEFAULTS: types.UserSettings = {
  user_id: 0,
  weight_unit: 'lbs',
  calorie_target: 2000,
  protein_target: 150,
  carb_target: 250,
  fat_target: 65,
  workout_layout: (localStorage.getItem(LAYOUT_KEY) as 'list' | 'gym') ?? 'list',
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  fetch: async () => {
    if (get().loaded) return
    try {
      const s = await userAPI.getSettings()
      const layout = localStorage.getItem(LAYOUT_KEY) as 'list' | 'gym' | null
      set({ settings: { ...s, workout_layout: layout ?? 'list' }, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  update: async (patch) => {
    set(state => ({ settings: { ...state.settings, ...patch } }))
    const updated = await userAPI.updateSettings(patch)
    const layout = localStorage.getItem(LAYOUT_KEY) as 'list' | 'gym' | null
    set({ settings: { ...updated, workout_layout: layout ?? 'list' } })
  },

  setWorkoutLayout: (layout) => {
    localStorage.setItem(LAYOUT_KEY, layout)
    set(state => ({ settings: { ...state.settings, workout_layout: layout } }))
  },

  reset: () => set({ settings: DEFAULTS, loaded: false }),
}))

export const weightLabel = (unit: string) => unit === 'kg' ? 'kg' : 'lbs'
export const weightShort = (unit: string) => unit === 'kg' ? 'kg' : 'lb'

// Backend always stores lbs. Use these helpers everywhere weight values are read/written.
export const lbsToDisplay = (lbs: number, unit: string): number =>
  unit === 'kg' ? lbs / 2.20462 : lbs

export const displayToLbs = (val: number, unit: string): number =>
  unit === 'kg' ? val * 2.20462 : val

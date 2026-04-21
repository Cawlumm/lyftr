import { create } from 'zustand'
import * as types from '../types'
import { userAPI } from '../services/api'

interface SettingsStore {
  settings: types.UserSettings
  loaded: boolean
  fetch: () => Promise<void>
  update: (patch: Partial<types.UserSettings>) => Promise<void>
  reset: () => void
}

const DEFAULTS: types.UserSettings = {
  user_id: 0,
  weight_unit: 'lbs',
  calorie_target: 2000,
  protein_target: 150,
  carb_target: 250,
  fat_target: 65,
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  fetch: async () => {
    if (get().loaded) return
    try {
      const s = await userAPI.getSettings()
      set({ settings: s, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  update: async (patch) => {
    set(state => ({ settings: { ...state.settings, ...patch } }))
    const updated = await userAPI.updateSettings(patch)
    set({ settings: updated })
  },

  reset: () => set({ settings: DEFAULTS, loaded: false }),
}))

export const weightLabel = (unit: string) => unit === 'kg' ? 'kg' : 'lbs'
export const weightShort = (unit: string) => unit === 'kg' ? 'kg' : 'lb'

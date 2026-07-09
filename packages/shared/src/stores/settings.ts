import { create } from 'zustand'
import * as types from '../types'
import { StorageAdapter } from '../storage'
import { LyftrClient } from '../client'

// Client-only pref keys (device storage, not server-side).
const LAYOUT_KEY = 'lyftr_workout_layout'
const REST_ON_KEY = 'lyftr_rest_enabled'
const REST_SEC_KEY = 'lyftr_rest_seconds'

type ClientPrefs = Pick<types.UserSettings, 'workout_layout' | 'rest_enabled' | 'rest_seconds_default'>

// Client-only prefs — re-applied over any backend fetch so a settings GET/PUT never
// clobbers them.
async function clientPrefs(storage: StorageAdapter): Promise<ClientPrefs> {
  const [layout, restOn, restSec] = await Promise.all([
    storage.get(LAYOUT_KEY),
    storage.get(REST_ON_KEY),
    storage.get(REST_SEC_KEY),
  ])
  return {
    workout_layout: (layout as 'list' | 'gym') ?? 'list',
    rest_enabled: restOn !== 'false', // default on
    rest_seconds_default: Number(restSec) || 90,
  }
}

const BASE_DEFAULTS: types.UserSettings = {
  user_id: 0,
  weight_unit: 'lbs',
  calorie_target: 2000,
  protein_target: 150,
  carb_target: 250,
  fat_target: 65,
  workout_layout: 'list',
  rest_enabled: true,
  rest_seconds_default: 90,
}

export interface SettingsStore {
  settings: types.UserSettings
  loaded: boolean
  fetch: () => Promise<void>
  update: (patch: Partial<types.UserSettings>) => Promise<void>
  setWorkoutLayout: (layout: 'list' | 'gym') => Promise<void>
  setRestEnabled: (on: boolean) => Promise<void>
  setRestSeconds: (secs: number) => Promise<void>
  reset: () => void
}

export function createSettingsStore(client: LyftrClient, storage: StorageAdapter) {
  return create<SettingsStore>((set, get) => ({
    settings: BASE_DEFAULTS,
    loaded: false,

    fetch: async () => {
      if (get().loaded) return
      const prefs = await clientPrefs(storage)
      try {
        const s = await client.userAPI.getSettings()
        set({ settings: { ...s, ...prefs }, loaded: true })
      } catch {
        set({ settings: { ...get().settings, ...prefs }, loaded: true })
      }
    },

    update: async (patch) => {
      set((state) => ({ settings: { ...state.settings, ...patch } }))
      const updated = await client.userAPI.updateSettings(patch)
      const prefs = await clientPrefs(storage)
      set({ settings: { ...updated, ...prefs } })
    },

    setWorkoutLayout: async (layout) => {
      await storage.set(LAYOUT_KEY, layout)
      set((state) => ({ settings: { ...state.settings, workout_layout: layout } }))
    },

    setRestEnabled: async (on) => {
      await storage.set(REST_ON_KEY, String(on))
      set((state) => ({ settings: { ...state.settings, rest_enabled: on } }))
    },

    setRestSeconds: async (secs) => {
      await storage.set(REST_SEC_KEY, String(secs))
      set((state) => ({ settings: { ...state.settings, rest_seconds_default: secs } }))
    },

    reset: () => set({ settings: BASE_DEFAULTS, loaded: false }),
  }))
}

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
  timezone: 'UTC',
}

export interface SettingsStore {
  settings: types.UserSettings
  loaded: boolean
  // True when `loaded` is standing on DEFAULTS because the read failed, not on the
  // user's own settings. The distinction is not cosmetic: a screen that offers to
  // save while this is true will write the defaults over whatever the server still
  // holds — a failed read plus one ordinary click, and the targets are gone.
  loadFailed: boolean
  // Device-only prefs, no network. Call before first render.
  hydratePrefs: () => Promise<void>
  fetch: () => Promise<void>
  update: (patch: Partial<types.UserSettings>) => Promise<void>
  setWorkoutLayout: (layout: 'list' | 'gym') => Promise<void>
  setRestEnabled: (on: boolean) => Promise<void>
  setRestSeconds: (secs: number) => Promise<void>
  reset: () => void
}

// Reports the device's IANA zone, or null when it can't be determined. Injected
// per platform because the two runtimes disagree: browsers answer through Intl,
// but Hermes does not expose the device zone to JS at all (a polyfilled Intl
// reports "UTC" everywhere), so mobile has to ask the OS via expo-localization.
// Returning null is the honest answer when detection fails — the store then sends
// nothing and the server keeps whatever it has.
export type TimezoneDetector = () => string | null

export function createSettingsStore(
  client: LyftrClient,
  storage: StorageAdapter,
  detectTimezone?: TimezoneDetector,
) {
  // Push the device zone up if it differs from what the server has. Runs after
  // every settings fetch, which both apps already do on launch, so travel and a
  // moved device are picked up without any explicit "sync timezone" step.
  //
  // Failures are swallowed: a wrong timezone degrades the day boundaries, but a
  // throw here would break loading settings entirely, which is far worse.
  const syncTimezone = async (current: types.UserSettings) => {
    if (!detectTimezone) return current
    let detected: string | null = null
    try {
      detected = detectTimezone()
    } catch {
      return current
    }
    if (!detected || detected === current.timezone) return current
    try {
      return await client.userAPI.updateSettings({ timezone: detected })
    } catch {
      return current
    }
  }

  return create<SettingsStore>((set, get) => ({
    settings: BASE_DEFAULTS,
    loaded: false,
    loadFailed: false,

    // The three client-only prefs, read from device storage with no network call.
    //
    // These have to be right on the FIRST render, not once fetch() returns, because
    // they are read by mount-only effects: the gym-layout election on the active
    // workout screen runs with an empty dependency list, so a `workout_layout` that
    // still says 'list' when it fires leaves a gym-mode user in the list layout and
    // never re-runs. `loaded` stays false — this is not the settings fetch.
    hydratePrefs: async () => {
      const prefs = await clientPrefs(storage)
      set((state) => ({ settings: { ...state.settings, ...prefs } }))
    },

    fetch: async () => {
      // `loaded` alone would make this a no-op forever after a failed read, because the
      // failure path sets it too — so a Retry button would do nothing at all. A load that
      // fell back to defaults is exactly the one worth attempting again.
      if (get().loaded && !get().loadFailed) return
      const prefs = await clientPrefs(storage)
      try {
        const s = await client.userAPI.getSettings()
        // Render on what we already have, then reconcile the zone in the background.
        // Awaiting the PATCH would put a write on the critical path of loading
        // settings — on a stalled connection every screen that gates on `loaded`
        // waits for a socket timeout instead of showing data already in hand.
        set({ settings: { ...s, ...prefs }, loaded: true, loadFailed: false })
        void syncTimezone(s).then((synced) => {
          // Only the timezone is written back. Splatting the whole response would
          // undo anything the user changed while the PATCH was in flight — flipping
          // to kg mid-sync would silently revert, because the response carries the
          // pre-edit values for every other field.
          if (synced !== s) {
            set((state) => ({ settings: { ...state.settings, timezone: synced.timezone } }))
          }
        })
      } catch {
        // Still `loaded`, because blocking every screen on a settings read would be
        // worse — but flagged, so a screen that can WRITE these values knows they are
        // substitutes rather than the user's.
        set({ settings: { ...get().settings, ...prefs }, loaded: true, loadFailed: true })
      }
    },

    // Optimistic, then reconciled — but the optimism has to be undone when the write
    // fails, or the app shows kg while the server still holds lbs and the next launch
    // silently flips it back. Rolling back HERE rather than at each call site is what
    // makes that true for every caller, including the ones that only toggle.
    //
    // Rethrows: the caller still has to say what happened. Rollback answers "what does
    // the app believe", not "does the user know".
    update: async (patch) => {
      const before = get().settings
      set((state) => ({ settings: { ...state.settings, ...patch } }))
      try {
        const updated = await client.userAPI.updateSettings(patch)
        const prefs = await clientPrefs(storage)
        set({ settings: { ...updated, ...prefs } })
      } catch (err) {
        // Restore only the keys this patch touched: anything else may have been
        // changed by another action while the write was in flight.
        const rollback = Object.fromEntries(
          Object.keys(patch).map((k) => [k, before[k as keyof types.UserSettings]]),
        ) as Partial<types.UserSettings>
        set((state) => ({ settings: { ...state.settings, ...rollback } }))
        throw err
      }
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

    // Forget the signed-in user's server-side settings (targets, unit, timezone) on
    // sign-out, but KEEP the three device-only prefs.
    //
    // They belong to the device, not the account: they live under their own storage
    // keys, sign-out does not clear those keys, and hydratePrefs() only runs once at
    // startup. Resetting them to BASE_DEFAULTS would leave the store claiming
    // workout_layout: 'list' while storage still says 'gym', with nothing to correct it
    // until the next settings fetch returns. A gym-mode user who reaches the active
    // workout screen inside that window is stuck in the list layout for the whole
    // session, because that election is a mount-only effect and never re-runs.
    reset: () =>
      set((state) => ({
        settings: {
          ...BASE_DEFAULTS,
          workout_layout: state.settings.workout_layout,
          rest_enabled: state.settings.rest_enabled,
          rest_seconds_default: state.settings.rest_seconds_default,
        },
        loaded: false,
        loadFailed: false,
      })),
  }))
}

// App-wide singletons: one API client + the Zustand stores, all bound to the mobile
// SecureStore/AsyncStorage adapter. Import these hooks anywhere in the app.
import { router } from 'expo-router'
import * as Localization from 'expo-localization'
import {
  createClient,
  createUseRestTimer,
  createAuthStore,
  createServerStore,
  createSettingsStore,
  createThemeStore,
  createWorkoutSession,
  testServerConnection,
  useServerInfoFor,
} from '@lyftr/shared'
import { storage } from './storage'

export const client = createClient(storage, {
  // The dev machine's backend, when nothing is saved. Same value the server store
  // shows in Settings — passed to both because the client reads storage, not the store.
  fallbackBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  // When a token refresh fails, the session is dead — kick back to login.
  onAuthFailure: () => {
    try {
      router.replace('/login')
    } catch {
      // router may not be mounted yet during cold start; the auth gate will catch it.
    }
  },
})

export const useAuthStore = createAuthStore(client, storage)
// Where the backend lives while developing, read from .env / .env.local the way Expo
// prescribes for exactly this: EXPO_PUBLIC_ variables are statically inlined at bundle
// time, so `process.env.EXPO_PUBLIC_API_URL` written in full (no destructuring, no
// bracket access) becomes a literal. Not a secret - the docs are explicit that these are
// visible in the shipped bundle - and a self-hosted backend URL is not one.
//
// This replaces the dev host buttons that used to sit on the sign-in screen. Same job,
// no UI, and it covers the simulator and a physical device too, because each machine
// puts its own address in .env.local rather than picking from a hardcoded list.
// A user-saved URL always wins; this only fills the blank.
export const useServerStore = createServerStore(storage, process.env.EXPO_PUBLIC_API_URL ?? '')
// Ask the OS, not Intl: Hermes doesn't expose the device zone to JavaScript, so a
// polyfilled Intl.DateTimeFormat().resolvedOptions().timeZone reports "UTC" on
// every phone — which would look like the feature worked while doing nothing.
const detectTimezone = () => Localization.getCalendars()[0]?.timeZone ?? null

export const useSettingsStore = createSettingsStore(client, storage, detectTimezone)
// Light-first on mobile (per product); mirrors the web's theme logic + 'theme' key.
export const useThemeStore = createThemeStore(storage, 'light')
// Workout session state (active workout + gym UI position) — device-local via
// AsyncStorage; rest-timer state is in-memory only (see the store).
export const useWorkoutSession = createWorkoutSession(storage)


// Rest-timer state derived from the session store above. Logic in @lyftr/shared.
export const useRestTimer = createUseRestTimer(useWorkoutSession)

// The selected server's /info — version and whether it is taking new accounts. Same
// hook and same cache the web uses; only the store binding differs.
export const useServerInfo = () =>
  useServerInfoFor(useServerStore((s) => s.serverUrl), testServerConnection)

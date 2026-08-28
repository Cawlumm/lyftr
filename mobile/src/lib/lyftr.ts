// App-wide singletons: one API client + the Zustand stores, all bound to the mobile
// SecureStore/AsyncStorage adapter. Import these hooks anywhere in the app.
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
  // A failed refresh means the session is dead. Say that ONCE, in the one place that
  // owns it - the store - and let app/_layout.tsx's gate move the user. This used to
  // also call router.replace('/login') while leaving isAuthenticated true, so the gate
  // saw an authed user in the (auth) group and sent them back; the screens refetched, the
  // refresh failed again, and the two bounced until React threw "Maximum update depth
  // exceeded" and the app stopped answering presses until it was force-quit (#145).
  //
  // Fire-and-forget because this runs inside an axios interceptor, which cannot await.
  // logout() clears the same storage keys the interceptor already cleared, which is
  // harmless, and flips isAuthenticated - the part that was missing.
  onAuthFailure: () => {
    void useAuthStore.getState().logout()
  },
})

export const useAuthStore = createAuthStore(client, storage)
export const useServerStore = createServerStore(storage)
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

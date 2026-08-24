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
  configureNumberLocale,
  testServerConnection,
  useServerInfoFor,
} from '@lyftr/shared'
import { storage } from './storage'

export const client = createClient(storage, {
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
export const useServerStore = createServerStore(storage)
// Ask the OS, not Intl: Hermes doesn't expose the device zone to JavaScript, so a
// polyfilled Intl.DateTimeFormat().resolvedOptions().timeZone reports "UTC" on
// every phone — which would look like the feature worked while doing nothing.
const detectTimezone = () => Localization.getCalendars()[0]?.timeZone ?? null

// Same reason, same source: which character means "decimal" has to come from the OS,
// because Hermes leaves Intl.NumberFormat#formatToParts unimplemented on iOS — deriving
// the separators from Intl would crash there rather than degrade. Without this every
// field reads input as en-US, so a German "1.234,5" parses as 1.2345 and an Arabic
// keypad's digits are deleted outright, logging a weight of 0 (#141).
const numberLocale = Localization.getLocales()[0]
configureNumberLocale({
  decimal: numberLocale?.decimalSeparator,
  group: numberLocale?.digitGroupingSeparator,
})

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

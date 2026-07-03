// App-wide singletons: one API client + the Zustand stores, all bound to the mobile
// SecureStore/AsyncStorage adapter. Import these hooks anywhere in the app.
import { router } from 'expo-router'
import {
  createClient,
  createAuthStore,
  createServerStore,
  createSettingsStore,
  createThemeStore,
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
export const useSettingsStore = createSettingsStore(client, storage)
// Light-first on mobile (per product); mirrors the web's theme logic + 'theme' key.
export const useThemeStore = createThemeStore(storage, 'light')

export { storage }

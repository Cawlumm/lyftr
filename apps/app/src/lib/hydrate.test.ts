import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
// SecureStore holds the tokens and cached user on native; an in-memory stand-in.
jest.mock('expo-secure-store', () => {
  const m = new Map<string, string>()
  return {
    getItemAsync: async (k: string) => m.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => { m.set(k, v) },
    deleteItemAsync: async (k: string) => { m.delete(k) },
  }
})

import { storage } from './storage'
import {
  useAuthStore, useServerStore, useThemeStore, useWorkoutSession, useSettingsStore,
} from './lyftr'

// The mobile counterpart of web/src/lib/lyftr.test.ts. Web awaits one hydrateStores() before
// first render; mobile fires each store's hydrate() from app/_layout.tsx and gates rendering
// on isHydrated (ready = isHydrated && themeHydrated && ...). So the contract pinned here is
// that each hydrate() settles its store from the storage adapter and flips its flag - the
// auth flag being the load-bearing one: the layout gate must not decide a route before it.
describe('store hydration from the mobile storage adapter', () => {
  beforeEach(async () => {
    await mockAsyncStorage.clear()
    for (const k of ['access_token', 'refresh_token', 'user']) await storage.remove(k)
    useAuthStore.setState({ user: null, isAuthenticated: false, isHydrated: false })
  })

  it('auth: not hydrated until hydrate() runs, then authenticated from stored credentials', async () => {
    await storage.set('access_token', 'tok')
    await storage.set('user', JSON.stringify({ id: 1, email: 'demo@lyftr.local' }))
    expect(useAuthStore.getState().isHydrated).toBe(false)

    await useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().isHydrated).toBe(true)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.email).toBe('demo@lyftr.local')
  })

  it('auth: reports signed-out when only one half of the credentials is present', async () => {
    await storage.set('access_token', 'tok') // no cached user
    await useAuthStore.getState().hydrate()
    expect(useAuthStore.getState().isHydrated).toBe(true)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('settles the server, theme and workout-session stores', async () => {
    await storage.set('server_url', 'https://lyftr.example.com')
    await storage.set('theme', 'dark')
    await storage.set('lyftr_active_session', JSON.stringify({
      name: 'Resumed', started_at: new Date().toISOString(), exercises: [],
    }))

    await useServerStore.getState().hydrate()
    await useThemeStore.getState().hydrate()
    await useWorkoutSession.getState().hydrate()

    expect(useServerStore.getState().serverUrl).toBe('https://lyftr.example.com')
    expect(useThemeStore.getState().mode).toBe('dark')
    expect(useThemeStore.getState().isHydrated).toBe(true)
    expect(useWorkoutSession.getState().session?.name).toBe('Resumed')
  })

  it('applies the device-only prefs, which mount-only effects read on first render', async () => {
    await storage.set('lyftr_workout_layout', 'gym')
    await storage.set('lyftr_rest_seconds', '120')

    await useSettingsStore.getState().hydratePrefs()

    expect(useSettingsStore.getState().settings.workout_layout).toBe('gym')
    expect(useSettingsStore.getState().settings.rest_seconds_default).toBe(120)
  })
})

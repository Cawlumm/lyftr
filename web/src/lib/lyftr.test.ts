import { describe, it, expect, beforeEach } from 'vitest'
import { hydrateStores, useAuthStore, useServerStore, useSettingsStore, useThemeStore, useWorkoutSession } from './lyftr'
import { storage } from './storage'
import { surfaces } from '@lyftr/shared'

// main.tsx awaits hydrateStores() before the first render. Everything that depends on
// that ordering is invisible from the store code itself, so this pins the contract:
// which stores are in the set, and that they are actually settled when it resolves.
//
// The auth entry is the load-bearing one. App.tsx's catch-all is a
// <Navigate to="/login">, which performs a history replace — if auth were dropped from
// this list, a deep link could be replaced before hydration resolved and the URL would
// be gone for good. The e2e deep-link cases assert the user-visible outcome, but they
// cannot catch that removal today (localStorage settles within a microtask, so React's
// first commit loses the race either way). This test can.

describe('hydrateStores', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ user: null, isAuthenticated: false, isHydrated: false })
    useServerStore.setState({ serverUrl: '', isHydrated: false })
    useThemeStore.setState({ mode: 'dark', isHydrated: false })
    useWorkoutSession.setState({ session: null })
  })

  it('settles the auth store — the one the catch-all route depends on', async () => {
    localStorage.setItem('access_token', 'tok')
    localStorage.setItem('user', JSON.stringify({ id: 1, email: 'demo@lyftr.local' }))

    await hydrateStores()

    expect(useAuthStore.getState().isHydrated).toBe(true)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.email).toBe('demo@lyftr.local')
  })

  it('reports signed-out when only one half of the credentials is present', async () => {
    localStorage.setItem('access_token', 'tok') // no cached user
    await hydrateStores()
    expect(useAuthStore.getState().isHydrated).toBe(true)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('settles the server, theme and workout-session stores too', async () => {
    localStorage.setItem('server_url', 'https://lyftr.example.com')
    localStorage.setItem('theme', 'light')
    localStorage.setItem('lyftr_active_session', JSON.stringify({
      name: 'Resumed', started_at: new Date().toISOString(), exercises: [],
    }))

    await hydrateStores()

    expect(useServerStore.getState().serverUrl).toBe('https://lyftr.example.com')
    expect(useThemeStore.getState().mode).toBe('light')
    expect(useWorkoutSession.getState().session?.name).toBe('Resumed')
  })

  it('applies the device-only prefs, which mount-only effects read on first render', async () => {
    localStorage.setItem('lyftr_workout_layout', 'gym')
    localStorage.setItem('lyftr_rest_seconds', '120')

    await hydrateStores()

    expect(useSettingsStore.getState().settings.workout_layout).toBe('gym')
    expect(useSettingsStore.getState().settings.rest_seconds_default).toBe(120)
  })

  it('paints the theme class before the first render', async () => {
    localStorage.setItem('theme', 'light')
    document.documentElement.classList.add('dark')

    await hydrateStores()

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  // Browsers diff theme-color to decide whether to repaint their chrome, and editing the
  // existing element's content is not reliably seen as a change — the address bar stayed
  // stale until a reload. So the assertion is not just "the value is right" but "the node
  // was replaced", which is the part that makes the repaint happen. Exactly one must
  // survive, or the browser reads whichever it likes.
  it('replaces the theme-color element so the browser repaints its chrome', async () => {
    const original = document.createElement('meta')
    original.setAttribute('name', 'theme-color')
    original.setAttribute('content', surfaces.dark.base)
    document.head.appendChild(original)

    localStorage.setItem('theme', 'light')
    await hydrateStores()

    const tags = document.head.querySelectorAll('meta[name="theme-color"]')
    expect(tags).toHaveLength(1)
    expect(tags[0].getAttribute('content')).toBe(surfaces.light.base)
    expect(tags[0]).not.toBe(original)
    expect(original.isConnected).toBe(false)

    tags[0].remove()
  })
})

describe('the localStorage StorageAdapter', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips get/set/remove', async () => {
    await storage.set('k', 'v')
    expect(await storage.get('k')).toBe('v')
    await storage.remove('k')
    expect(await storage.get('k')).toBeNull()
  })

  it('returns null — not undefined — for a missing key', async () => {
    // Shared's stores branch on `stored ? … : ''` and the type is Promise<string|null>;
    // a naive `?? undefined` here would break those checks.
    const v = await storage.get('nope')
    expect(v).toBeNull()
    expect(v).not.toBeUndefined()
  })
})

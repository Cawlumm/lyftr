import {
  createAuthStore,
  createUseRestTimer,
  createClient,
  createServerStore,
  createSettingsStore,
  createThemeStore,
  createWorkoutSession,
  surfaces,
} from '@lyftr/shared'
import { storage } from './storage'

// App-wide singletons: one API client plus the Zustand stores, all bound to the web
// localStorage adapter. Mirrors mobile/src/lib/lyftr.ts — same factories, different
// platform bindings. The auth store is still web's own (src/stores/auth.ts); it moves
// here with its hydration gate in a follow-up, because that one changes first-paint
// routing behaviour and deserves its own review.
export const client = createClient(storage, {
  // A failed token refresh means the session is dead. A hard location assignment
  // rather than react-router's navigate: this runs inside an axios interceptor with
  // no router context, and throwing the page away is the point — it clears any state
  // built from the dead session.
  onAuthFailure: () => { window.location.href = '/login' },
  // Same escape hatch as before: an explicit build-time API URL wins over the
  // user-configured server, for deployments that pin the backend.
  baseUrlOverride: import.meta.env.VITE_API_URL as string | undefined,
})

export const useAuthStore = createAuthStore(client, storage)
export const useServerStore = createServerStore(storage)

// Web reads the zone straight from Intl — unlike Hermes, every browser reports the
// real device zone here.
const detectTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || null

export const useSettingsStore = createSettingsStore(client, storage, detectTimezone)
export const useWorkoutSession = createWorkoutSession(storage)
// Dark-first on web (mobile is light-first, per product).
export const useThemeStore = createThemeStore(storage, 'dark')

// Replaces the theme-color tag rather than editing it. Browsers diff this value to decide
// whether to repaint their chrome, and setAttribute('content', …) on the existing element
// is not always seen as a change — which is why the address bar used to lag until a
// reload. Removing the node and inserting a fresh one is unambiguous.
//
// Not a prefers-color-scheme pair: this theme lives in localStorage and defaults to dark
// whatever the OS reports, so an OS query would paint a light bar over a dark app.
const paintThemeColor = (color: string) => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove())
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', color)
  document.head.appendChild(meta)
}

// The <html class="dark"> toggle every CSS variable cascades from, plus the browser chrome
// so the two move together. Kept out of the store because the store is platform-agnostic;
// called once before the first render and again on every change, so the class and the store
// never disagree. `color-scheme` (emitted into :root and .dark by the token plugin) already
// handles scrollbars and form controls with no JavaScript; this covers the address bar,
// which CSS cannot reach.
export const applyThemeClass = (mode: 'light' | 'dark') => {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  paintThemeColor(surfaces[mode].base)
}

// Load everything persisted before the first render. localStorage is synchronous, so
// this settles within a microtask — but the stores' API is async (mobile's Keychain
// is genuinely so), and rendering before it resolves would show one frame of default
// state: an empty server URL in Settings, and "No active workout" on top of a session
// that is actually still running.
export const hydrateStores = async () => {
  await Promise.all([
    // Auth first among equals — this is the one that MUST be settled before the first
    // render. App.tsx's catch-all route is a <Navigate to="/login">, and <Navigate>
    // performs a history *replace*: rendering while isAuthenticated is still false
    // would not merely flash the login screen, it would destroy the URL the user
    // arrived on. A deep link, an emailed link, or a refresh mid-workout would be
    // unrecoverable — back does not bring it back.
    useAuthStore.getState().hydrate(),
    useServerStore.getState().hydrate(),
    useWorkoutSession.getState().hydrate(),
    // Device-only prefs, no network — the gym-layout election on the active workout
    // screen is a mount-only effect, so workout_layout must be right on first render.
    useSettingsStore.getState().hydratePrefs(),
    useThemeStore.getState().hydrate(),
  ])
  // Paint the theme before React renders, so there is no flash of the default. This is
  // why theme could only move to the shared store once hydration gated the first render.
  applyThemeClass(useThemeStore.getState().mode)
  useThemeStore.subscribe((s) => applyThemeClass(s.mode))
}

// Rest-timer state derived from the session store above. The logic lives in
// @lyftr/shared; this binds it to web's store instance.
export const useRestTimer = createUseRestTimer(useWorkoutSession)

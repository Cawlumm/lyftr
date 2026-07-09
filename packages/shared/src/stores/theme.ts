import { create } from 'zustand'
import { StorageAdapter } from '../storage'

// Mirrors web/src/hooks/useTheme.ts: theme is 'light' | 'dark', persisted under the
// 'theme' key, with a toggle. The default is a parameter so web (dark-first) and mobile
// (light-first, per product) can share this logic while choosing their own default.
export type ThemeMode = 'light' | 'dark'
const THEME_KEY = 'theme'

export interface ThemeStore {
  mode: ThemeMode
  isHydrated: boolean
  hydrate: () => Promise<void>
  setMode: (m: ThemeMode) => Promise<void>
  toggle: () => Promise<void>
}

export function createThemeStore(storage: StorageAdapter, defaultMode: ThemeMode = 'light') {
  const persist = async (m: ThemeMode) => {
    await storage.set(THEME_KEY, m)
  }
  return create<ThemeStore>((set, get) => ({
    mode: defaultMode,
    isHydrated: false,
    hydrate: async () => {
      const stored = await storage.get(THEME_KEY)
      set({ mode: stored === 'light' || stored === 'dark' ? stored : defaultMode, isHydrated: true })
    },
    setMode: async (m) => {
      await persist(m)
      set({ mode: m })
    },
    toggle: async () => {
      const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark'
      await persist(next)
      set({ mode: next })
    },
  }))
}

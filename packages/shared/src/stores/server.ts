import { create } from 'zustand'
import { StorageAdapter, STORAGE_KEYS } from '../storage'
import { normalizeServerUrl } from '../utils/serverUrl'

export interface ServerStore {
  serverUrl: string // '' = default backend
  isHydrated: boolean
  hydrate: () => Promise<void>
  setServerUrl: (url: string) => Promise<void>
}

// Factory — bind to a platform storage adapter. `serverUrl` is loaded via hydrate()
// at startup and persisted on change. normalizeServerUrl rejects scheme-less/garbage
// input by returning '' (the caller surfaces the error).
// `fallback` is the URL to use when the user has not chosen one - the dev machine's
// backend, passed in from EXPO_PUBLIC_API_URL. It is a parameter rather than a lookup so
// this stays platform-agnostic: web reads its own origin, mobile reads the env var, and
// neither has to know about the other.
export function createServerStore(storage: StorageAdapter, fallback = '') {
  return create<ServerStore>((set) => ({
    serverUrl: '',
    isHydrated: false,

    hydrate: async () => {
      const stored = await storage.get(STORAGE_KEYS.serverUrl)
      set({ serverUrl: stored || normalizeServerUrl(fallback), isHydrated: true })
    },

    setServerUrl: async (url: string) => {
      const normalized = normalizeServerUrl(url)
      if (normalized) await storage.set(STORAGE_KEYS.serverUrl, normalized)
      else await storage.remove(STORAGE_KEYS.serverUrl)
      set({ serverUrl: normalized })
    },
  }))
}

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
export function createServerStore(storage: StorageAdapter) {
  return create<ServerStore>((set) => ({
    serverUrl: '',
    isHydrated: false,

    hydrate: async () => {
      const stored = await storage.get(STORAGE_KEYS.serverUrl)
      set({ serverUrl: stored || '', isHydrated: true })
    },

    setServerUrl: async (url: string) => {
      const normalized = normalizeServerUrl(url)
      if (normalized) await storage.set(STORAGE_KEYS.serverUrl, normalized)
      else await storage.remove(STORAGE_KEYS.serverUrl)
      set({ serverUrl: normalized })
    },
  }))
}

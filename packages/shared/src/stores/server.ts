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
// `fallback` is the URL to use when the user has not chosen one - on mobile, the dev
// machine's backend from EXPO_PUBLIC_API_URL. A parameter rather than a lookup so this
// file stays platform-agnostic; web passes nothing, because '' already means "talk to the
// origin this page was served from" there.
//
// Note the same value must also reach createClient as `fallbackBaseUrl`: requests resolve
// their base from storage, not from this store, so setting it here alone changes what the
// settings screen SHOWS and not where anything goes.
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

import { create } from 'zustand'
import * as types from '../types'
import { StorageAdapter, STORAGE_KEYS } from '../storage'
import { LyftrClient, apiErrorMessage } from '../client'

export interface AuthStore {
  user: types.User | null
  isAuthenticated: boolean
  isHydrated: boolean            // true once initial storage read completes
  isLoading: boolean
  error: string | null
  hydrate:   () => Promise<void>
  login:     (email: string, password: string) => Promise<void>
  register:  (email: string, password: string) => Promise<void>
  logout:    () => Promise<void>
  clearError: () => void
}

// Factory — bind the store to a platform client + storage adapter. Unlike the web
// store (synchronous localStorage read at module init), initial auth state is loaded
// asynchronously via `hydrate()`, called once at app startup.
export function createAuthStore(client: LyftrClient, storage: StorageAdapter) {
  return create<AuthStore>((set) => ({
    user: null,
    isAuthenticated: false,
    isHydrated: false,
    isLoading: false,
    error: null,

    hydrate: async () => {
      const [token, userStr] = await Promise.all([
        storage.get(STORAGE_KEYS.access),
        storage.get(STORAGE_KEYS.user),
      ])
      const user = userStr ? (JSON.parse(userStr) as types.User) : null
      set({ user, isAuthenticated: !!token && !!user, isHydrated: true })
    },

    login: async (email, password) => {
      set({ isLoading: true, error: null })
      try {
        const data = await client.authAPI.login({ email, password })
        await storage.set(STORAGE_KEYS.access, data.token)
        await storage.set(STORAGE_KEYS.refresh, data.refresh_token)
        await storage.set(STORAGE_KEYS.user, JSON.stringify(data.user))
        set({ user: data.user, isAuthenticated: true, isLoading: false })
      } catch (err: any) {
        // Same message logic as the web login page: server-provided error if present,
        // else a status-aware hint (network/CORS, 5xx, misconfigured URL) via apiErrorMessage.
        set({ error: apiErrorMessage(err, 'Invalid email or password.'), isLoading: false })
        throw err
      }
    },

    register: async (email, password) => {
      set({ isLoading: true, error: null })
      try {
        const data = await client.authAPI.register({ email, password })
        await storage.set(STORAGE_KEYS.access, data.token)
        await storage.set(STORAGE_KEYS.refresh, data.refresh_token)
        await storage.set(STORAGE_KEYS.user, JSON.stringify(data.user))
        set({ user: data.user, isAuthenticated: true, isLoading: false })
      } catch (err: any) {
        set({ error: apiErrorMessage(err, 'Registration failed.'), isLoading: false })
        throw err
      }
    },

    logout: async () => {
      await storage.remove(STORAGE_KEYS.access)
      await storage.remove(STORAGE_KEYS.refresh)
      await storage.remove(STORAGE_KEYS.user)
      set({ user: null, isAuthenticated: false, error: null })
    },

    clearError: () => set({ error: null }),
  }))
}

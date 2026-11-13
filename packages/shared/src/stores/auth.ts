import { create } from 'zustand'
import * as types from '../types'
import { StorageAdapter, STORAGE_KEYS } from '../storage'
import type { LyftrClient, UiMessage } from '../client'

export interface AuthStore {
  user: types.User | null
  isAuthenticated: boolean
  isHydrated: boolean            // true once initial storage read completes
  isLoading: boolean
  // The inputs of the message, not its text: the screen runs it through uiMessage() at render, so
  // a failure already on screen follows a language switch.
  error: UiMessage | null
  hydrate:   () => Promise<void>
  login:     (email: string, password: string) => Promise<void>
  register:  (email: string, password: string) => Promise<void>
  logout:    () => Promise<void>
  changeEmail: (email: string, currentPassword: string) => Promise<types.User>
  clearError: () => void
}

// Factory — bind the store to a platform client + storage adapter. Unlike the web
// store (synchronous localStorage read at module init), initial auth state is loaded
// asynchronously via `hydrate()`, called once at app startup.
export function createAuthStore(client: LyftrClient, storage: StorageAdapter) {
  const useStore = create<AuthStore>((set) => ({
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
      // The cached user predates fields the server has since added (is_admin), so a device
      // signed in before an upgrade would keep showing the old shape until the next login.
      // Not awaited and never fatal: offline, the cached copy is what there is.
      if (token && user) {
        try {
          void Promise.resolve(client.userAPI.me()).then(async (fresh) => {
            if (!fresh || !useStore.getState().isAuthenticated) return
            await storage.set(STORAGE_KEYS.user, JSON.stringify(fresh))
            useStore.setState({ user: fresh })
          }).catch(() => {})
        } catch {
          // best-effort
        }
      }
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
        set({ error: { key: 'auth.login.failed', cause: err, detail: 'full' }, isLoading: false })
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
        set({ error: { key: 'auth.register.failed', cause: err, detail: 'full' }, isLoading: false })
        throw err
      }
    },

    logout: async () => {
      // Read before the storage is cleared, sent after, and never awaited: signing out has to
      // work with no network, and what the server learns is a courtesy (it stops a copied
      // refresh token living out its 30 days), not a precondition. Any failure, including a
      // client without the method, is swallowed for the same reason.
      const refreshToken = await storage.get(STORAGE_KEYS.refresh)
      await storage.remove(STORAGE_KEYS.access)
      await storage.remove(STORAGE_KEYS.refresh)
      await storage.remove(STORAGE_KEYS.user)
      set({ user: null, isAuthenticated: false, error: null })
      if (refreshToken) {
        try {
          void Promise.resolve(client.authAPI.logout(refreshToken)).catch(() => {})
        } catch {
          // best-effort
        }
      }
    },

    // No try/catch and no store.error: the screen's useAsyncAction reports the failure
    // where the tap was, and a failed call leaves state and storage untouched. This is
    // the only place the outgoing address is trimmed.
    changeEmail: async (email, currentPassword) => {
      const user = await client.userAPI.changeEmail({ email: email.trim(), current_password: currentPassword })
      await storage.set(STORAGE_KEYS.user, JSON.stringify(user))
      set({ user })
      return user
    },

    clearError: () => set({ error: null }),
  }))
  return useStore
}

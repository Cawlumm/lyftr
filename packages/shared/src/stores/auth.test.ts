import { createAuthStore } from './auth'
import { createMemoryStorage } from '../testing/memoryStorage'
import { STORAGE_KEYS } from '../storage'
import type { LyftrClient } from '../client'
import type { AuthResponse } from '../types'

const fakeAuthResponse: AuthResponse = {
  token: 'access-123',
  refresh_token: 'refresh-456',
  user: { id: 1, email: 'demo@lyftr.local', created_at: '2026-01-01T00:00:00Z' },
}

// Minimal fake client — only the auth endpoints the store touches.
function fakeClient(overrides: Partial<AuthResponse> = {}, shouldFail = false): LyftrClient {
  const impl = async () => {
    if (shouldFail) {
      const err: any = new Error('bad creds')
      err.response = { data: { error: 'Invalid email or password' } }
      throw err
    }
    return { ...fakeAuthResponse, ...overrides }
  }
  return { authAPI: { login: impl, register: impl } } as unknown as LyftrClient
}

describe('auth store (storage-adapter DI)', () => {
  it('login persists tokens+user to storage and flips auth state', async () => {
    const storage = createMemoryStorage()
    const useAuth = createAuthStore(fakeClient(), storage)

    await useAuth.getState().login('demo@lyftr.local', 'password123')

    const state = useAuth.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.email).toBe('demo@lyftr.local')
    expect(await storage.get(STORAGE_KEYS.access)).toBe('access-123')
    expect(await storage.get(STORAGE_KEYS.refresh)).toBe('refresh-456')
    expect(JSON.parse((await storage.get(STORAGE_KEYS.user))!).id).toBe(1)
  })

  it('failed login surfaces the server error and stays logged out', async () => {
    const storage = createMemoryStorage()
    const useAuth = createAuthStore(fakeClient({}, true), storage)

    await expect(useAuth.getState().login('x@y.z', 'nope')).rejects.toBeTruthy()
    const state = useAuth.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.error).toBe('Invalid email or password')
    expect(await storage.get(STORAGE_KEYS.access)).toBeNull()
  })

  it('logout clears storage and state', async () => {
    const storage = createMemoryStorage()
    const useAuth = createAuthStore(fakeClient(), storage)
    await useAuth.getState().login('demo@lyftr.local', 'password123')

    await useAuth.getState().logout()

    expect(useAuth.getState().isAuthenticated).toBe(false)
    expect(await storage.get(STORAGE_KEYS.access)).toBeNull()
    expect(await storage.get(STORAGE_KEYS.user)).toBeNull()
  })

  it('hydrate restores auth state from seeded storage', async () => {
    const storage = createMemoryStorage({
      [STORAGE_KEYS.access]: 'seeded-token',
      [STORAGE_KEYS.user]: JSON.stringify(fakeAuthResponse.user),
    })
    const useAuth = createAuthStore(fakeClient(), storage)

    expect(useAuth.getState().isHydrated).toBe(false)
    await useAuth.getState().hydrate()

    const state = useAuth.getState()
    expect(state.isHydrated).toBe(true)
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.email).toBe('demo@lyftr.local')
  })
})

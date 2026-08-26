import { createServerStore } from './server'
import { createClient } from '../client'
import { STORAGE_KEYS } from '../storage'
import type { StorageAdapter } from '../storage'

function memoryStorage(seed: Record<string, string> = {}): StorageAdapter & { raw: Record<string, string> } {
  const raw = { ...seed }
  return {
    raw,
    get: async (k: string) => raw[k] ?? null,
    set: async (k: string, v: string) => { raw[k] = v },
    remove: async (k: string) => { delete raw[k] },
  }
}

const DEV_BACKEND = 'http://10.0.2.2:3000'

// The fallback is what a developer's EXPO_PUBLIC_API_URL fills in, and it has to reach two
// places that do not talk to each other: the store (so Settings shows it) and the client
// (so requests actually go there). Getting only the first is a bug that LOOKS fine — the
// sign-in screen probes the fallback, reports "Connected", and then login posts to a
// relative /api/v1 that React Native cannot resolve. That shipped in a first draft.
describe('server URL fallback', () => {
  it('fills the store when nothing is saved', async () => {
    const store = createServerStore(memoryStorage(), DEV_BACKEND)
    await store.getState().hydrate()
    expect(store.getState().serverUrl).toBe(DEV_BACKEND)
  })

  it('loses to a saved URL', async () => {
    const saved = 'https://lyftr.example.com'
    const store = createServerStore(memoryStorage({ [STORAGE_KEYS.serverUrl]: saved }), DEV_BACKEND)
    await store.getState().hydrate()
    expect(store.getState().serverUrl).toBe(saved)
  })

  it('does not persist itself — it is a default, not a choice', async () => {
    const storage = memoryStorage()
    const store = createServerStore(storage, DEV_BACKEND)
    await store.getState().hydrate()
    expect(storage.raw[STORAGE_KEYS.serverUrl]).toBeUndefined()
  })

  it('ignores a fallback that is not a usable URL', async () => {
    const store = createServerStore(memoryStorage(), '10.0.2.2:3000') // no scheme
    await store.getState().hydrate()
    expect(store.getState().serverUrl).toBe('')
  })

  it('reaches the API CLIENT, not just the store', async () => {
    // The one that matters. resolveAPIBase reads storage directly and never looks at the
    // store, so this is separate wiring rather than a consequence of the test above. Driven
    // through a real request, the way client.test.ts does it — the base URL a request
    // actually carries is the only thing that proves the fallback works.
    const bases: string[] = []
    const client = createClient(memoryStorage(), { fallbackBaseUrl: DEV_BACKEND })
    client.api.defaults.adapter = async (config: any) => {
      bases.push(config.baseURL)
      return { data: { data: {} }, status: 200, statusText: 'OK', headers: {}, config }
    }
    await client.userAPI.me()
    expect(bases).toEqual([`${DEV_BACKEND}/api/v1`])
  })

  it('still lets a saved URL win at the client', async () => {
    const saved = 'https://lyftr.example.com'
    const bases: string[] = []
    const client = createClient(memoryStorage({ [STORAGE_KEYS.serverUrl]: saved }), {
      fallbackBaseUrl: DEV_BACKEND,
    })
    client.api.defaults.adapter = async (config: any) => {
      bases.push(config.baseURL)
      return { data: { data: {} }, status: 200, statusText: 'OK', headers: {}, config }
    }
    await client.userAPI.me()
    expect(bases).toEqual([`${saved}/api/v1`])
  })
})

import { StorageAdapter } from '../storage'

// In-memory StorageAdapter for tests (and could back a web fallback). Mirrors the
// async contract so tests exercise the same code path as SecureStore/AsyncStorage.
export function createMemoryStorage(seed: Record<string, string> = {}): StorageAdapter & {
  dump: () => Record<string, string>
} {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    get: async (key) => (store.has(key) ? store.get(key)! : null),
    set: async (key, value) => { store.set(key, value) },
    remove: async (key) => { store.delete(key) },
    dump: () => Object.fromEntries(store),
  }
}

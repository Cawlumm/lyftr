import { StorageAdapter, STORAGE_KEYS } from '@lyftr/shared'

// The web StorageAdapter. localStorage is synchronous, so every method resolves on
// the same microtask — the async signature exists for mobile's Keychain, not for us.
//
// There is no browser equivalent of mobile's SecureStore split: anything readable by
// this app's JavaScript is readable by any script running on the origin. Tokens live
// in localStorage exactly as they did before this seam existed; the keys are unchanged
// (see STORAGE_KEYS), so an already-signed-in user stays signed in.
//
// get() must return null, never undefined, for a missing key: shared's stores branch on
// `stored ? … : ''` and its type is Promise<string | null>. localStorage.getItem already
// returns null, so this passes it through untouched rather than defaulting it.
export const storage: StorageAdapter = {
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => localStorage.setItem(key, value),
  remove: async (key) => localStorage.removeItem(key),
}

export { STORAGE_KEYS }

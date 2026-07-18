// Injected storage abstraction — the one seam that lets the API client and stores
// be platform-agnostic. Web implements this over localStorage; mobile implements it
// over expo-secure-store (tokens) + AsyncStorage (prefs). All async so a secure,
// Keychain-backed implementation is possible.
export interface StorageAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

// Canonical storage keys — kept identical to the web app's localStorage keys so a
// future web migration to @lyftr/shared is a drop-in.
export const STORAGE_KEYS = {
  access: 'access_token',
  refresh: 'refresh_token',
  user: 'user',
  serverUrl: 'server_url',
} as const

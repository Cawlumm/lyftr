import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { StorageAdapter, STORAGE_KEYS } from '@lyftr/shared'

// The mobile StorageAdapter: on native, secrets (tokens + cached user) live in the
// Keychain via SecureStore, non-secret prefs in AsyncStorage. On the web target
// (used to drive/verify the app in a browser) SecureStore has no implementation, so
// everything falls back to AsyncStorage (localStorage-backed).
const SECURE = new Set<string>([STORAGE_KEYS.access, STORAGE_KEYS.refresh, STORAGE_KEYS.user])
const isSecure = (key: string) => Platform.OS !== 'web' && SECURE.has(key)

export const storage: StorageAdapter = {
  get: (key) => (isSecure(key) ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key)),
  set: async (key, value) => {
    if (isSecure(key)) await SecureStore.setItemAsync(key, value)
    else await AsyncStorage.setItem(key, value)
  },
  remove: async (key) => {
    if (isSecure(key)) await SecureStore.deleteItemAsync(key)
    else await AsyncStorage.removeItem(key)
  },
}

import { create } from 'zustand'
import { StorageAdapter } from '../storage'
import { i18n, resolveLanguage, SUPPORTED_LANGUAGES, type LanguagePreference } from '../i18n'

// Device-level preference, persisted like theme. 'system' follows the device's language
// list; anything else pins one supported language.
const LANGUAGE_KEY = 'lyftr_language'

export type LanguageDetector = () => readonly string[]

export interface LanguageStore {
  preference: LanguagePreference
  isHydrated: boolean
  hydrate: () => Promise<void>
  setPreference: (p: LanguagePreference) => Promise<void>
}

const isPreference = (v: string | null): v is LanguagePreference =>
  v === 'system' || (v !== null && (SUPPORTED_LANGUAGES as string[]).includes(v))

export function createLanguageStore(storage: StorageAdapter, detectLanguages: LanguageDetector) {
  const safeTags = (): readonly string[] => {
    try {
      const tags = detectLanguages()
      return Array.isArray(tags) ? tags : []
    } catch {
      return []
    }
  }
  const apply = async (p: LanguagePreference) => {
    await i18n.changeLanguage(resolveLanguage(p, safeTags()))
  }
  return create<LanguageStore>((set) => ({
    preference: 'system',
    isHydrated: false,
    hydrate: async () => {
      // An unreadable store means "no preference", not a language screen that never
      // finishes loading: hydration gates app start on mobile.
      const stored = await storage.get(LANGUAGE_KEY).catch(() => null)
      const preference = isPreference(stored) ? stored : 'system'
      await apply(preference)
      set({ preference, isHydrated: true })
    },
    setPreference: async (p) => {
      // Apply first: a storage failure costs the choice surviving a restart, not the tap.
      set({ preference: p })
      await apply(p)
      await storage.set(LANGUAGE_KEY, p).catch(() => undefined)
    },
  }))
}

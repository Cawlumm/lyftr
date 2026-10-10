import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import es from './locales/es.json'

// The registry. SUPPORTED_LANGUAGES is derived from this object, never written out again.
const resources = {
  en: { translation: en },
  es: { translation: es },
} as const

export type Language = keyof typeof resources
export const SUPPORTED_LANGUAGES = Object.keys(resources) as Language[]
export type LanguagePreference = 'system' | Language

// Endonyms: never translated, so someone stuck in a language they cannot read can still
// find their own.
export const LANGUAGE_NAMES = { en: 'English', es: 'Español' } satisfies Record<Language, string>

// Mirrored in locales/README.md; catalog.test.ts fails when the two disagree.
export const MACHINE_TRANSLATED = { en: false, es: true } satisfies Record<Language, boolean>

// One fixed collation (CLDR root; 'en' has no tailoring, so scripts group together) so the
// picker does not reshuffle the moment the reader switches language.
export const LANGUAGE_ORDER: readonly Language[] = [...SUPPORTED_LANGUAGES].sort((a, b) =>
  LANGUAGE_NAMES[a].localeCompare(LANGUAGE_NAMES[b], 'en'),
)

// Mapping device tags to a supported language lives here, not in an i18next detector
// plugin: each app only reports raw BCP-47 tags, and this is the one place that picks.
export function resolveLanguage(pref: LanguagePreference, deviceTags: readonly string[]): Language {
  if (pref !== 'system') return pref
  for (const tag of deviceTags) {
    const primary = String(tag).split(/[-_]/)[0].toLowerCase()
    if ((SUPPORTED_LANGUAGES as string[]).includes(primary)) return primary as Language
  }
  return 'en'
}

// Synchronous init at module load so tests and the first render get English with no
// hydration. Numbers and dates are NOT formatted through i18next (CLAUDE.md, Numbers &
// Locale): callers pass the already-formatted text in as a placeholder.
void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  initAsync: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

export { i18n }

export function languageChoiceLabel(p: LanguagePreference): string {
  if (p !== 'system') return LANGUAGE_NAMES[p]
  const cur = i18n.resolvedLanguage
  const name = cur && cur in LANGUAGE_NAMES ? LANGUAGE_NAMES[cur as Language] : LANGUAGE_NAMES.en
  return i18n.t('settings.language.systemChoice', { name })
}

export function machineTranslatedNote(code: Language): string | null {
  return MACHINE_TRANSLATED[code] ? i18n.getFixedT(code)('settings.language.machineTranslated') : null
}

export { useTranslation, Trans } from 'react-i18next'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}

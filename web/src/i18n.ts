import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Translations are auto-discovered: every `src/locales/<code>.json` is bundled
// at build time, so adding a language is just committing one JSON file — no code
// change. This is what lets Weblate open translation PRs that work on merge.
// See TRANSLATING.md.
const modules = import.meta.glob('./locales/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>

const FALLBACK_LANG = 'en'
const STORAGE_KEY = 'lyftr_lang'

const resources: Record<string, { translation: Record<string, unknown> }> = {}
for (const [path, mod] of Object.entries(modules)) {
  const code = path.match(/\/([^/]+)\.json$/)?.[1]
  if (code) resources[code] = { translation: mod.default }
}

// Label each language by its autonym (its own name, e.g. "Deutsch") so the
// switcher reads naturally regardless of the active UI language.
const labelFor = (code: string): string => {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code)
    if (name && name !== code) return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    // Intl.DisplayNames unsupported or code unknown — fall back to the code.
  }
  return code.toUpperCase()
}

export const SUPPORTED_LANGUAGES = Object.keys(resources)
  .sort()
  .map(code => ({ code, label: labelFor(code) }))

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: FALLBACK_LANG,
    supportedLngs: Object.keys(resources),
    load: 'languageOnly', // resolve "de-DE" → "de"
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
  })

// Keep <html lang> in sync so screen readers and the browser pick the right
// hyphenation/spellcheck rules.
const applyHtmlLang = (lng: string) => {
  document.documentElement.lang = lng
}
applyHtmlLang(i18n.resolvedLanguage ?? FALLBACK_LANG)
i18n.on('languageChanged', applyHtmlLang)

export default i18n

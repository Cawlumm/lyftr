import en from './locales/en.json'
import es from './locales/es.json'
import { i18n, resolveLanguage } from './index'

// The CI guard for the catalogs. Runs on Node's full ICU under an en-US jest, so
// Intl.PluralRules here knows every locale; the Hermes path is pinned separately by
// mobile/src/lib/pluralRules.test.ts.

const catalogs: Record<string, unknown> = { en, es }

const flatten = (obj: unknown, prefix = ''): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object') Object.assign(out, flatten(v, key))
    else out[key] = v as string
  }
  return out
}

const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/
const placeholders = (s: string) =>
  new Set([...s.matchAll(/\{\{\s*([^},\s]+)/g)].map((m) => m[1]))
const sorted = (s: Iterable<string>) => [...s].sort()

const flat: Record<string, Record<string, string>> = {}
for (const [code, cat] of Object.entries(catalogs)) flat[code] = flatten(cat)

const pluralBases = [...new Set(Object.keys(flat.en).map((k) => PLURAL.exec(k)?.[1]).filter((b): b is string => !!b))]
const categoriesOf = (locale: string) => new Intl.PluralRules(locale).resolvedOptions().pluralCategories

// A key's expected shape in a locale: en's non-plural keys, plus base_<cat> for each of the
// locale's own categories.
const expectedKeys = (locale: string) => {
  const keys = Object.keys(flat.en).filter((k) => !PLURAL.test(k))
  for (const base of pluralBases) for (const c of categoriesOf(locale)) keys.push(`${base}_${c}`)
  return keys.sort()
}

describe('catalogs', () => {
  it('has no empty values', () => {
    for (const [code, cat] of Object.entries(flat)) {
      const empty = Object.entries(cat).filter(([, v]) => typeof v !== 'string' || v.trim() === '').map(([k]) => k)
      expect({ code, empty }).toEqual({ code, empty: [] })
    }
  })

  it('en carries exactly the plural categories English needs', () => {
    for (const base of pluralBases) {
      const have = Object.keys(flat.en).filter((k) => PLURAL.exec(k)?.[1] === base).map((k) => PLURAL.exec(k)![2])
      expect({ base, have: sorted(have) }).toEqual({ base, have: sorted(categoriesOf('en')) })
    }
  })

  it.each(Object.keys(catalogs))('%s has exactly the English key set and its own plural categories', (code) => {
    const actual = Object.keys(flat[code]).sort()
    const expected = expectedKeys(code)
    expect({ missing: expected.filter((k) => !actual.includes(k)) }).toEqual({ missing: [] })
    expect({ extra: actual.filter((k) => !expected.includes(k)) }).toEqual({ extra: [] })
  })

  it.each(Object.keys(catalogs))('%s uses the same {{placeholders}} as English', (code) => {
    const mismatches: string[] = []
    for (const [key, value] of Object.entries(flat[code])) {
      const m = PLURAL.exec(key)
      const enKey = m ? `${m[1]}_other` : key
      const want = placeholders(flat.en[enKey])
      const got = placeholders(value)
      if (m) { want.delete('count'); got.delete('count') }
      if (sorted(want).join() !== sorted(got).join()) mismatches.push(key)
    }
    expect(mismatches).toEqual([])
  })
})

describe('plural selection', () => {
  afterEach(async () => { await i18n.changeLanguage('en') })

  it('en picks one / other', () => {
    expect(i18n.t('settings.library.refreshed', { count: 1, amount: '1' })).toBe(en.settings.library.refreshed_one.replace('{{amount}}', '1'))
    expect(i18n.t('settings.library.refreshed', { count: 2, amount: '2' })).toBe(en.settings.library.refreshed_other.replace('{{amount}}', '2'))
    expect(i18n.t('settings.library.refreshed', { count: 0, amount: '0' })).toBe(en.settings.library.refreshed_other.replace('{{amount}}', '0'))
  })

  it('es picks one / other / many', async () => {
    await i18n.changeLanguage('es')
    const lib = es.settings.library
    expect(i18n.t('settings.library.refreshed', { count: 1, amount: '1' })).toBe(lib.refreshed_one.replace('{{amount}}', '1'))
    expect(i18n.t('settings.library.refreshed', { count: 2, amount: '2' })).toBe(lib.refreshed_other.replace('{{amount}}', '2'))
    expect(i18n.t('settings.library.refreshed', { count: 1000000, amount: '1.000.000' })).toBe(lib.refreshed_many.replace('{{amount}}', '1.000.000'))
  })
})

describe('resolveLanguage', () => {
  it.each([
    ['system', ['es-MX', 'en'], 'es'],
    ['system', ['fr-FR', 'es'], 'es'],
    ['system', ['fr'], 'en'],
    ['system', [], 'en'],
    ['system', [''], 'en'],
    ['system', ['ES_es'], 'es'],
    ['en', ['es'], 'en'],
  ] as const)('%s + %j -> %s', (pref, tags, want) => {
    expect(resolveLanguage(pref, tags)).toBe(want)
  })
})

describe('key safety', () => {
  it('rejects an unknown key at type level', () => {
    // @ts-expect-error unknown key is a type error
    i18n.t('settings.noSuchKey')
  })
})

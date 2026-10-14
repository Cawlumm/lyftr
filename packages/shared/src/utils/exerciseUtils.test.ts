import { i18n } from '../i18n'
import { catalogSyncLines, categoryLabel, equipmentLabel, exerciseCatalogEmpty, muscleLabel, resolveMuscleSlugs } from './exerciseUtils'

// A stand-in for the per-platform tables — the rule under test is the lookup, not any
// particular library's slug vocabulary.
const TABLE: Record<string, string[]> = {
  chest: ['chest'],
  legs: ['quadriceps', 'hamstring', 'calves', 'gluteal'],
  quadriceps: ['quadriceps'],
  'anterior deltoid': ['front-deltoids'],
}

describe('resolveMuscleSlugs', () => {
  it('maps an exact muscle name to its body-diagram slugs', () => {
    expect(resolveMuscleSlugs('legs', TABLE)).toEqual(['quadriceps', 'hamstring', 'calves', 'gluteal'])
  })

  it('normalizes case and surrounding whitespace before matching', () => {
    expect(resolveMuscleSlugs('  Chest ', TABLE)).toEqual(['chest'])
  })

  it('falls back to a partial match in either direction', () => {
    // key shorter than the table entry
    expect(resolveMuscleSlugs('quad', TABLE)).toEqual(['quadriceps'])
    // key longer than the table entry — free-text names from the exercise DB
    expect(resolveMuscleSlugs('left anterior deltoid head', TABLE)).toEqual(['front-deltoids'])
  })

  it('returns [] for empty or unknown input', () => {
    expect(resolveMuscleSlugs('', TABLE)).toEqual([])
    expect(resolveMuscleSlugs('zzz', TABLE)).toEqual([])
  })
})

// The table equipmentLabel replaced, kept here so English is pinned to what it rendered.
const OLD_EQUIPMENT_LABEL: Record<string, string> = {
  'body-only': 'Bodyweight', 'barbell': 'Barbell', 'dumbbell': 'Dumbbell', 'machine': 'Machine',
  'cable': 'Cable', 'kettlebells': 'Kettlebell', 'bands': 'Bands', 'medicine-ball': 'Med Ball',
  'e-z-curl-bar': 'EZ Bar', 'exercise-ball': 'Exercise Ball', 'foam-roll': 'Foam Roll',
  'none': 'None', 'other': 'Other',
  'body only': 'Bodyweight', 'medicine ball': 'Med Ball', 'e-z curl bar': 'EZ Bar',
  'exercise ball': 'Exercise Ball', 'foam roll': 'Foam Roll',
}

afterEach(async () => { await i18n.changeLanguage('en') })

describe('equipmentLabel', () => {
  it('gives every raw key and pre-migration alias the label the old table did (en)', () => {
    for (const [raw, label] of Object.entries(OLD_EQUIPMENT_LABEL)) {
      expect({ raw, label: equipmentLabel(raw) }).toEqual({ raw, label })
    }
  })

  it('passes an unknown or empty value through as it came', () => {
    expect(equipmentLabel('sandbag')).toBe('sandbag')
    expect(equipmentLabel('')).toBe('')
    expect(equipmentLabel(undefined)).toBe('')
  })

  it('reads in the active language (es), spaced and hyphenated spellings alike', async () => {
    await i18n.changeLanguage('es')
    expect(equipmentLabel('body-only')).toBe('Peso corporal')
    expect(equipmentLabel('body only')).toBe('Peso corporal')
    expect(equipmentLabel('sandbag')).toBe('sandbag')
  })
})

describe('muscleLabel', () => {
  it('gives the slug back unchanged in en, as the screens rendered it before the catalog', () => {
    for (const slug of ['chest', 'lower-back', 'middle-back', 'full-body', 'quadriceps', 'abs']) {
      expect(muscleLabel(slug)).toBe(slug)
    }
  })

  it('passes an unknown or empty value through as it came', () => {
    expect(muscleLabel('rotator cuff')).toBe('rotator cuff')
    expect(muscleLabel('lower back')).toBe('lower back')
    expect(muscleLabel('Chest')).toBe('Chest')
    expect(muscleLabel('')).toBe('')
    expect(muscleLabel(undefined)).toBe('')
  })

  it('reads in the active language (es)', async () => {
    await i18n.changeLanguage('es')
    expect(muscleLabel('lower-back')).toBe('espalda baja')
    expect(muscleLabel('chest')).toBe('pecho')
  })
})

describe('categoryLabel', () => {
  it('gives the slug back unchanged in en, as the screens rendered it before the catalog', () => {
    for (const slug of ['strength', 'stretching', 'plyometrics', 'strongman', 'powerlifting', 'cardio', 'olympic-weightlifting']) {
      expect(categoryLabel(slug)).toBe(slug)
    }
  })

  it('shows the pre-migration spaced spelling as it came in en', () => {
    expect(categoryLabel('olympic weightlifting')).toBe('olympic weightlifting')
  })

  it('passes an unknown or empty value through as it came', () => {
    expect(categoryLabel('flexibility')).toBe('flexibility')
    expect(categoryLabel('')).toBe('')
    expect(categoryLabel(undefined)).toBe('')
  })

  it('reads in the active language (es), spaced and hyphenated spellings alike', async () => {
    await i18n.changeLanguage('es')
    expect(categoryLabel('strength')).toBe('fuerza')
    expect(categoryLabel('plyometrics')).toBe('pliometría')
    expect(categoryLabel('olympic-weightlifting')).toBe('halterofilia')
    expect(categoryLabel('olympic weightlifting')).toBe('halterofilia')
    expect(categoryLabel('flexibility')).toBe('flexibility')
  })
})

describe('exerciseCatalogEmpty (locale-independent)', () => {
  const settled = { items: [], hasMore: false, error: null }

  it('is true for an unfiltered page that settled empty', () => {
    expect(exerciseCatalogEmpty('', settled)).toBe(true)
  })

  it('is false for a search that matched nothing', () => {
    expect(exerciseCatalogEmpty('squat', settled)).toBe(false)
  })

  it('is false while a page is still expected', () => {
    expect(exerciseCatalogEmpty('', { ...settled, hasMore: true })).toBe(false)
  })

  it('is false after a failure', () => {
    expect(exerciseCatalogEmpty('', { ...settled, error: 'offline' })).toBe(false)
  })

  it('is false when rows arrived', () => {
    expect(exerciseCatalogEmpty('', { ...settled, items: [{ id: 1 }] })).toBe(false)
  })
})

describe('catalogSyncLines', () => {
  // The clock is 2026-10-10 15:00 local, so "today" times draw as a time alone. English
  // unless a case says otherwise.
  beforeEach(() => { jest.useFakeTimers({ now: new Date(2026, 9, 10, 15, 0) }) })
  afterEach(async () => {
    jest.useRealTimers()
    await i18n.changeLanguage('en')
  })

  const at = (h: number, m = 0) => new Date(2026, 9, 10, h, m).toISOString()

  it('says nothing without a status or from a server too old to send sync fields', () => {
    expect(catalogSyncLines(null)).toEqual([])
    expect(catalogSyncLines({ count: 5 })).toEqual([])
  })

  it('reports the last clean pass', () => {
    expect(catalogSyncLines({ count: 5, last_synced_at: at(14) })).toEqual([{ text: 'Last synced at 2:00 PM', warning: false }])
  })

  it('says Syncing while a pass runs and hides the failure', () => {
    const lines = catalogSyncLines({ count: 5, syncing: true, last_failed: true, last_failure: 'other', last_synced_at: at(14) })
    expect(lines).toEqual([
      { text: 'Last synced at 2:00 PM', warning: false },
      { text: 'Syncing…', warning: false },
    ])
  })

  it('names an unreachable catalog and the retry time', () => {
    expect(catalogSyncLines({ count: 5, last_failed: true, last_failure: 'unreachable', next_attempt_at: at(15, 30) })).toEqual([
      { text: "Last sync couldn't reach the exercise catalog. Trying again at 3:30 PM.", warning: true },
    ])
  })

  it('uses the generic sentence for any other reason, known or not', () => {
    const generic = "Last sync didn't finish. Trying again at 3:30 PM."
    expect(catalogSyncLines({ count: 5, last_failed: true, last_failure: 'other', next_attempt_at: at(15, 30) })[0].text).toBe(generic)
    expect(catalogSyncLines({ count: 5, last_failed: true, last_failure: 'newer' as 'other', next_attempt_at: at(15, 30) })[0].text).toBe(generic)
  })

  it('drops the retry clause when the time is past or unknown', () => {
    const base = { count: 5, last_failed: true, last_failure: 'other' as const }
    expect(catalogSyncLines({ ...base, next_attempt_at: at(14, 59) })[0].text).toBe("Last sync didn't finish.")
    expect(catalogSyncLines({ ...base, next_attempt_at: null })[0].text).toBe("Last sync didn't finish.")
  })

  it('draws in Spanish', async () => {
    await i18n.changeLanguage('es')
    const text = catalogSyncLines({ count: 5, last_failed: true, last_failure: 'other', next_attempt_at: at(15, 30) })[0].text
    expect(text).toContain('Nuevo intento: 15:30.')
  })
})

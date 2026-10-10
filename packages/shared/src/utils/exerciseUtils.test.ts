import { i18n } from '../i18n'
import { categoryLabel, equipmentLabel, muscleLabel, resolveMuscleSlugs } from './exerciseUtils'

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

  it('reads the pre-migration spaced spelling as the hyphenated slug', () => {
    expect(categoryLabel('olympic weightlifting')).toBe('olympic-weightlifting')
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

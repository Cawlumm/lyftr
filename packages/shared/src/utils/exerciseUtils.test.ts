import { EQUIPMENT_LABEL, resolveMuscleSlugs } from './exerciseUtils'

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

describe('EQUIPMENT_LABEL', () => {
  it('maps the exercise DB\'s raw equipment strings to friendly labels', () => {
    expect(EQUIPMENT_LABEL['body only']).toBe('Bodyweight')
    expect(EQUIPMENT_LABEL['kettlebells']).toBe('Kettlebell')
  })
})

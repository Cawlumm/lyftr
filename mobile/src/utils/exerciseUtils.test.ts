import { EQUIPMENT_LABEL, muscleColor, muscleToBodySlugs } from './exerciseUtils'

describe('muscleColor', () => {
  it('resolves a tint case-insensitively', () => {
    expect(muscleColor('Chest')?.text).toBe('#f87171')
    expect(muscleColor('LEGS')?.chip).toBe('bg-green-500/20')
  })

  it('returns null for an unknown muscle (caller renders the muted fallback)', () => {
    expect(muscleColor('unknown')).toBeNull()
  })
})

describe('muscleToBodySlugs', () => {
  it('maps an exact muscle name to its body-diagram slugs', () => {
    expect(muscleToBodySlugs('legs')).toEqual(['quadriceps', 'hamstring', 'calves', 'gluteal'])
  })

  it('normalizes case and whitespace before matching', () => {
    expect(muscleToBodySlugs('  Chest ')).toEqual(['chest'])
  })

  it('falls back to a partial match', () => {
    expect(muscleToBodySlugs('quad')).toEqual(['quadriceps'])
  })

  it('returns [] for empty or unknown input', () => {
    expect(muscleToBodySlugs('')).toEqual([])
    expect(muscleToBodySlugs('zzz')).toEqual([])
  })
})

describe('EQUIPMENT_LABEL', () => {
  it('maps "body only" to a friendly label', () => {
    expect(EQUIPMENT_LABEL['body only']).toBe('Bodyweight')
  })
})

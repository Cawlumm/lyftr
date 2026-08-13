import { muscleColor, muscleToBodySlugs } from './exerciseUtils'

// The lookup rule and EQUIPMENT_LABEL are covered in
// packages/shared/src/utils/exerciseUtils.test.ts. What's left here is what is
// genuinely mobile's: the tint shape and the RN body-highlighter slug remaps.

describe('muscleColor', () => {
  it('resolves a tint case-insensitively', () => {
    expect(muscleColor('Chest')?.text).toBe('#f87171')
    expect(muscleColor('LEGS')?.chip).toBe('bg-green-500/20')
  })

  it('returns null for an unknown muscle (caller renders the muted fallback)', () => {
    expect(muscleColor('unknown')).toBeNull()
  })
})

describe('muscleToBodySlugs — react-native-body-highlighter vocabulary', () => {
  it('collapses front/back deltoids to the single slug the RN library has', () => {
    expect(muscleToBodySlugs('shoulders')).toEqual(['deltoids'])
    expect(muscleToBodySlugs('rear deltoid')).toEqual(['deltoids'])
  })

  it('remaps parts the RN library lacks to the nearest one it has', () => {
    expect(muscleToBodySlugs('abductors')).toEqual(['gluteal'])
    expect(muscleToBodySlugs('middle back')).toEqual(['upper-back'])
  })

  it('maps a muscle group to every part it covers', () => {
    expect(muscleToBodySlugs('legs')).toEqual(['quadriceps', 'hamstring', 'calves', 'gluteal'])
  })
})

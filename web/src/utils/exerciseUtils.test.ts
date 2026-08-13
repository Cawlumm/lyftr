import { describe, it, expect } from 'vitest'
import { muscleColor, muscleColorBordered, muscleToBodySlugs } from './exerciseUtils'

// The lookup rule and EQUIPMENT_LABEL are covered in
// packages/shared/src/utils/exerciseUtils.test.ts. What's left here is what is
// genuinely web's: the Tailwind class output and the react-body-highlighter slugs.

describe('muscleColor', () => {
  it('drops the border class so the chip variant can sit in an unbordered badge', () => {
    const c = muscleColor('chest')
    expect(c).toBe('bg-red-500/20 text-red-400')
    expect(c).not.toMatch(/border-/)
  })

  it('keeps the border class in the bordered variant', () => {
    expect(muscleColorBordered('chest')).toBe('bg-red-500/20 text-red-400 border-red-500/30')
  })

  it('falls back to muted surface classes for an unknown muscle', () => {
    expect(muscleColor('unknown')).toBe('bg-surface-muted text-tx-muted')
    expect(muscleColorBordered('unknown')).toBe('bg-surface-muted text-tx-muted border-surface-border')
  })

  it('matches case-insensitively', () => {
    expect(muscleColor('LEGS')).toBe('bg-green-500/20 text-green-400')
  })
})

describe('muscleToBodySlugs — react-body-highlighter vocabulary', () => {
  it('splits shoulders into the front/back deltoids this library has', () => {
    expect(muscleToBodySlugs('shoulders')).toEqual(['front-deltoids', 'back-deltoids'])
    expect(muscleToBodySlugs('rear deltoid')).toEqual(['back-deltoids'])
  })

  it('has an abductors part of its own (the RN library does not)', () => {
    expect(muscleToBodySlugs('abductors')).toEqual(['abductors'])
  })

  it('maps a muscle group to every part it covers', () => {
    expect(muscleToBodySlugs('legs')).toEqual(['quadriceps', 'hamstring', 'calves', 'gluteal'])
  })
})

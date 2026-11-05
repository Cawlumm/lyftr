import { surfaces } from '@lyftr/shared'
import { muscleColor, muscleInk, muscleToBodySlugs } from './exerciseUtils'

// The lookup rule and the equipment and muscle labels are covered in
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

// Contrast is a property of rendered pixels: composite the chip's /20 tint over the surface it
// sits on, then measure the ink against that. 4.5:1 is WCAG 1.4.3 for normal text; a chip label
// is 12px.
const HUE_500: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', orange: '#f97316', purple: '#a855f7', pink: '#ec4899', green: '#22c55e',
  teal: '#14b8a6', yellow: '#eab308', lime: '#84cc16', amber: '#f59e0b', cyan: '#06b6d4', indigo: '#6366f1',
  sky: '#0ea5e9', rose: '#f43f5e', emerald: '#10b981', violet: '#8b5cf6',
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('muscleInk - AA on the chip tint, both themes', () => {
  const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'quadriceps', 'hamstrings', 'glutes', 'calves',
    'abdominals', 'core', 'forearms', 'traps', 'lats', 'lower-back', 'middle-back', 'neck', 'adductors', 'abductors']

  for (const mode of ['light', 'dark'] as const) {
    it(`${mode}: every ink clears 4.5:1 on the raised and base surfaces`, () => {
      for (const m of MUSCLES) {
        const tint = muscleColor(m)
        const hue = /bg-(\w+)-500\/20/.exec(tint?.chip ?? '')?.[1] ?? ''
        const ink = rgb(muscleInk(tint, mode === 'dark') ?? '#000000')
        for (const s of [surfaces[mode].raised, surfaces[mode].base]) {
          const bg = rgb(HUE_500[hue]).map((c, i) => c * 0.2 + rgb(s)[i] * 0.8)
          expect({ m, mode, ok: ratio(ink, bg) >= 4.5 }).toEqual({ m, mode, ok: true })
        }
      }
    })
  }

  it('is undefined for an unknown muscle, so the caller falls back to the muted ink', () => {
    expect(muscleInk(null, false)).toBeUndefined()
  })
})

import { semanticInk, palette, surfaces, type SemanticTone } from './tokens'

// THE STANDARD, enforced rather than written down: text on a tinted feedback surface must
// clear WCAG AA (4.5:1) against that tint, in both themes, on both apps.
//
// This exists because the rule was broken everywhere and nobody could see it. The 400
// shades came over from web's .alert-* classes, where they sit on a dark surface and read
// fine; mobile is light-first and web has a light theme, and on a white card the same
// pairing measures 2.4:1 for error and 1.4:1 for warning. Every alert in both apps, in a
// theme a user can actually be in, and it survived review because contrast is not
// something you notice by looking — you notice it by measuring.
//
// So this measures. Add a variant, change a shade, restyle an alert: if the pairing stops
// being legible, this fails before anyone ships it.

const AA_NORMAL_TEXT = 4.5
// The two tint strengths the alert idiom uses: the surface fill, and the slightly
// stronger fill used for a button sitting inside one (the duplicate-log confirm).
const TINTS = [0.1, 0.2]

const channel = (c: number): number => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

const luminance = (hex: string): number => {
  const [r, g, b] = rgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// What a translucent tint actually looks like once the card behind it is composited in.
// Contrast is a property of rendered pixels, not of the colour you typed.
const flatten = (tint: string, alpha: number, behind: string): string => {
  const [tr, tg, tb] = rgb(tint)
  const [br, bg, bb] = rgb(behind)
  const mix = (t: number, b: number) => Math.round(t * alpha + b * (1 - alpha))
  return `#${[mix(tr, br), mix(tg, bg), mix(tb, bb)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`
}

// The hue each variant tints its surface with.
const TINT_HUE: Record<SemanticTone, string> = {
  error: palette.error[500],
  warning: palette.warning[500],
  success: palette.success[500],
  info: palette.brand[500],
}

const VARIANTS = Object.keys(TINT_HUE) as SemanticTone[]
const MODES = ['light', 'dark'] as const

describe('feedback surfaces are legible in both themes', () => {
  for (const mode of MODES) {
    for (const variant of VARIANTS) {
      for (const alpha of TINTS) {
        it(`${mode}: ${variant} text on a ${alpha * 100}% tint`, () => {
          // Alerts sit on a card, which is the raised surface, not the page background.
          const behind = surfaces[mode].raised
          const background = flatten(TINT_HUE[variant], alpha, behind)
          const ratio = contrast(semanticInk[mode][variant], background)

          expect({ mode, variant, alpha, ratio: Number(ratio.toFixed(2)) }).toMatchObject({
            ratio: expect.any(Number),
          })
          expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
        })
      }
    }
  }

  // Not only on tints. A field's validation error and a destructive row label sit on the
  // plain card, and the 400s failed there too — 2.8:1 for error, 1.5:1 for warning on
  // white. That is the most common error a user ever reads, so it is the one that must
  // hold up.
  for (const mode of MODES) {
    for (const surface of ['base', 'raised'] as const) {
      for (const variant of VARIANTS) {
        it(`${mode}: ${variant} text on the plain ${surface} surface`, () => {
          const ratio = contrast(semanticInk[mode][variant], surfaces[mode][surface])
          expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
        })
      }
    }
  }

  // The pairing has to be a pair. If someone "simplifies" this to one shade for both
  // themes, one of them drops below AA — that is the whole reason the map is shaped this
  // way, and it is worth failing loudly rather than rediscovering it.
  it('cannot be collapsed to a single shade per variant', () => {
    for (const variant of VARIANTS) {
      expect(semanticInk.light[variant]).not.toBe(semanticInk.dark[variant])
    }
  })
})

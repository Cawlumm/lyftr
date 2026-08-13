import { accents, palette, surfaces, type SurfaceTokens } from '@lyftr/shared'

// Light + dark palettes and brand tokens, imported from @lyftr/shared so the two apps
// cannot drift. Web consumes the same values as CSS custom properties (emitted by the
// addBase plugin in web/tailwind.config.ts); this is the RN-shaped view of them.

export type ThemeColors = SurfaceTokens

export const palettes: Record<'light' | 'dark', ThemeColors> = surfaces

// Brand tokens (same in both themes). `cyanEdge` is the darker cyan used for accents
// on light surfaces (matches the web login's link color).
export const brand = {
  cyan: palette.brand[500],
  cyanLight: palette.brand[300],
  cyanEdge: accents.cyanEdge,
  violet: palette.violet[500],
  gradient: accents.gradient,
  success: palette.success[500],
  successSoft: palette.success[400],
  error: palette.error[500],
  errorSoft: palette.error[400],
  warning: palette.warning[500],
  warningSoft: palette.warning[400],
  // Near-black text for content sitting directly on a solid warning-500 fill (e.g.
  // "Apply all") — a named token instead of a repeated literal, and matches this
  // screen's other warningColor usages routing through brand/useTheme().
  warningText: accents.warningText,
}

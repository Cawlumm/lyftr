// Design tokens — the single definition of every colour the two apps draw with.
//
// Three consumers, three delivery mechanisms:
//   web/tailwind.config.ts   → `palette` becomes Tailwind colours; `cssVars()` is
//                              emitted as :root / .dark custom properties via addBase
//   web/src/index.css        → declares NO token values; it only consumes the vars
//   mobile/src/theme/theme.ts→ imports `surfaces` and `palette` directly
//
// This file must stay dependency-free. web/tailwind.config.ts deep-imports it rather
// than going through the package index, so that loading the Tailwind config doesn't
// drag axios, zustand and the API client into PostCSS.

export type SurfaceTokens = {
  base: string
  raised: string
  overlay: string
  border: string
  muted: string
  txPrimary: string
  txSecondary: string
  txMuted: string
  txInverse: string
}

export const surfaces: Record<'light' | 'dark', SurfaceTokens> = {
  light: {
    base: '#f8fafc',
    raised: '#ffffff',
    overlay: '#f1f5f9',
    border: '#e2e8f0',
    muted: '#f1f5f9',
    txPrimary: '#0f172a',
    txSecondary: '#475569',
    txMuted: '#94a3b8',
    txInverse: '#ffffff',
  },
  dark: {
    base: '#070d1a',
    raised: '#0d1629',
    overlay: '#111e35',
    border: '#1c2f50',
    muted: '#162240',
    txPrimary: '#f1f5f9',
    txSecondary: '#94a3b8',
    txMuted: '#475569',
    txInverse: '#0f172a',
  },
}

// Theme-independent: these read the same on either surface.
export const palette = {
  brand: {
    50: '#e0f9ff', 100: '#b0f1fe', 200: '#7ae7fd', 300: '#38d8fb', 400: '#0ecef7',
    500: '#00b8d9', 600: '#0099b8', 700: '#007a96', 800: '#005c72', 900: '#003d4d',
    DEFAULT: '#00b8d9',
  },
  violet: { 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', DEFAULT: '#8b5cf6' },
  success: { 400: '#4ade80', 500: '#22c55e', 800: '#166534', DEFAULT: '#22c55e' },
  warning: { 400: '#facc15', 500: '#eab308', 800: '#854d0e', DEFAULT: '#eab308' },
  error: { 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', DEFAULT: '#ef4444' },
} as const

export const accents = {
  // Darker cyan for accents sitting on light surfaces (the web login link colour).
  // Tailwind's cyan-600 — outside the brand ramp, which is tuned for dark surfaces.
  cyanEdge: '#0891b2',
  // For text on a brand-tinted alert in light mode: cyanEdge measures 3.4:1 there,
  // below AA. This rung clears it on both the /10 and /20 tints.
  cyanEdgeDeep: '#155e75',
  // Near-black text on a solid warning-500 fill (e.g. "Apply all"), where both white
  // and the normal text colour fail contrast.
  warningText: '#1a1400',
  gradient: [palette.brand[500], palette.violet[500]] as const,
} as const

// THE RULE: text on a tinted feedback surface must clear WCAG AA (4.5:1) against that
// tint, in BOTH themes. alertContrast.test.ts fails the build if any pair below does not.
//
// The 400s were used for this originally, copied from web's .alert-* classes where they
// sit on a dark surface and read fine. Mobile is light-first and web has a light theme,
// and on a white card the same pairing measures 2.4:1 for error and 1.4:1 for warning.
// Every alert in both apps was below AA in a theme a user can actually be in.
//
// No single rung clears both themes - that is why this is a pair rather than a constant.
// The light values are the lightest rungs that pass on both the /10 and /20 tints.
// Same shape as `accent`: darker on light, lighter on dark.
export const semanticInk = {
  light: {
    error: palette.error[700],
    warning: palette.warning[800],
    success: palette.success[800],
    info: accents.cyanEdgeDeep,
  },
  dark: {
    error: palette.error[400],
    warning: palette.warning[400],
    success: palette.success[400],
    info: palette.brand[300],
  },
} as const

export type SemanticTone = keyof typeof semanticInk['light']

export const GRADIENT_CSS = `linear-gradient(135deg, ${palette.brand[500]} 0%, ${palette.violet[500]} 100%)`

// Surface tokens as the CSS custom properties web consumes. The var names are part of
// the contract with index.css and tailwind.config.ts's `var(--...)` colour aliases —
// they are spelled once, here.
export function cssVars(mode: 'light' | 'dark'): Record<string, string> {
  const s = surfaces[mode]
  return {
    '--surface-base': s.base,
    '--surface-raised': s.raised,
    '--surface-overlay': s.overlay,
    '--surface-border': s.border,
    '--surface-muted': s.muted,
    '--tx-primary': s.txPrimary,
    '--tx-secondary': s.txSecondary,
    '--tx-muted': s.txMuted,
    '--tx-inverse': s.txInverse,
    '--alert-error': semanticInk[mode].error,
    '--alert-warning': semanticInk[mode].warning,
    '--alert-success': semanticInk[mode].success,
    '--alert-info': semanticInk[mode].info,
    'color-scheme': mode,
  }
}

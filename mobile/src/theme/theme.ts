// Light + dark palettes — the exact CSS-variable values from web/src/index.css, so the
// two apps look identical. Brand colors are theme-independent.
export type ThemeColors = {
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

export const palettes: Record<'light' | 'dark', ThemeColors> = {
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

// Brand tokens (same in both themes). `cyanEdge` is the darker cyan used for accents on
// light surfaces (matches the web login's link color).
export const brand = {
  cyan: '#00b8d9',
  cyanLight: '#38d8fb',
  cyanEdge: '#0891b2',
  violet: '#8b5cf6',
  gradient: ['#00b8d9', '#8b5cf6'] as const,
  success: '#22c55e',
  successSoft: '#4ade80',
  error: '#ef4444',
  errorSoft: '#f87171',
  warning: '#eab308',
  warningSoft: '#facc15',
  // Near-black text for content sitting directly on a solid warning-500 fill (e.g.
  // "Apply all") — mirrors web's ProgramDetail.tsx `text-[#1a1400]` as a named token
  // instead of a repeated literal, and matches this screen's other warningColor
  // usages routing through brand/useTheme() rather than a hardcoded hex.
  warningText: '#1a1400',
}

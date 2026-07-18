import { useThemeStore } from '../lib/lyftr'
import { palettes, brand } from './theme'

// One hook for all theming: current mode, the resolved color palette (for inline styles
// and gradients), brand tokens, and a legibility-safe accent (darker cyan on light,
// lighter cyan on dark — matches the web).
export function useTheme() {
  const mode = useThemeStore((s) => s.mode)
  const toggle = useThemeStore((s) => s.toggle)
  const setMode = useThemeStore((s) => s.setMode)
  const isDark = mode === 'dark'
  return {
    mode,
    isDark,
    colors: palettes[mode],
    brand,
    accent: isDark ? brand.cyanLight : brand.cyanEdge,
    toggle,
    setMode,
  }
}

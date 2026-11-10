import { palette } from '@lyftr/shared'
import { useTheme } from '../../../theme/useTheme'

export interface GroupColors {
  /** Fill for the icon square, tags and the current-round dot. White text sits on it at 4.5:1 or better. */
  solid: string
  /** Block border. */
  border: string
  /** Header and pill background. */
  tint: string
  /** Text and icons drawn on `tint` or on the card surface. */
  ink: string
}

const LIGHT: GroupColors[] = [
  { solid: palette.brand[700], border: palette.brand[200], tint: '#f0fdff', ink: palette.brand[800] },
  { solid: palette.violet[600], border: '#c4b5fd', tint: '#f5f3ff', ink: '#5b21b6' },
]
const DARK: GroupColors[] = [
  { solid: palette.brand[700], border: 'rgba(56,216,251,0.45)', tint: 'rgba(0,184,217,0.14)', ink: palette.brand[300] },
  { solid: palette.violet[600], border: 'rgba(167,139,250,0.5)', tint: 'rgba(139,92,246,0.18)', ink: palette.violet[400] },
]

// Group 1 is brand cyan, group 2 violet, then they alternate. Hue is never the only cue: the
// letter is always drawn beside it.
export function groupColors(colorIndex: number, isDark: boolean): GroupColors {
  const set = isDark ? DARK : LIGHT
  return set[((colorIndex % set.length) + set.length) % set.length]
}

export function useGroupColors(colorIndex: number): GroupColors {
  const { isDark } = useTheme()
  return groupColors(colorIndex, isDark)
}

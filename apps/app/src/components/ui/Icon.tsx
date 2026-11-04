import { Platform, View } from 'react-native'
import type { LucideIcon, LucideProps } from './icons'
import { useTheme } from '../../theme/useTheme'

export type IconSize = 'sm' | 'md' | 'lg'

export const ICON_SIZE: Record<IconSize, number> = { sm: 14, md: 16, lg: 20 }
export const ICON_STROKE = 2.2

const HIDDEN =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }

interface Props {
  icon: LucideIcon
  /** A scale step, or a pixel size for a call site that predates the scale. */
  size?: IconSize | number
  /** Defaults to primary text: React Native has no colour inheritance, so no currentColor. */
  color?: string
  strokeWidth?: number
  style?: LucideProps['style']
  /** Only when the icon is the sole content that carries the meaning; otherwise it is
   *  decorative and hidden from assistive tech, because its control already has a name. */
  label?: string
}

export function Icon({ icon: Glyph, size = 'md', color, strokeWidth = ICON_STROKE, label, style }: Props) {
  const { colors } = useTheme()
  const px = typeof size === 'number' ? size : ICON_SIZE[size]
  const glyph = <Glyph size={px} color={color ?? colors.txPrimary} strokeWidth={strokeWidth} style={style} {...HIDDEN} />
  if (!label) return glyph
  // Labelled on a wrapper: lucide copies its props onto every <path>, so a label on the
  // glyph itself would be announced once per path.
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      {glyph}
    </View>
  )
}

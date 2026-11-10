import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../ui'
import { useTheme } from '../../theme/useTheme'

interface MarkerProps {
  /** From groupOf: "A", "B", ... */
  letter: string
  /** 1-based place of this exercise inside its group. */
  position: number
  total: number
  /** compact: "A1" chip for list rows. full: "Superset A · 1 of 2" for headers and cards. */
  variant?: 'compact' | 'full'
}

// The rail is the shape cue, the letter and position are the text cue; neither relies on hue.
// accent clears 3:1 on both themes' surfaces.
export function SupersetMarker({ letter, position, total, variant = 'compact' }: MarkerProps) {
  const { t } = useTranslation()
  const { accent } = useTheme()
  const full = variant === 'full'
  return (
    <View
      accessible
      accessibilityLabel={t('workouts.superset.position', { letter, position, total })}
      className="flex-row items-center self-start rounded-md border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5"
    >
      <AppText variant="label" className="text-xs" style={{ color: accent }}>
        {full ? t('workouts.superset.badge', { letter, position, total }) : `${letter}${position}`}
      </AppText>
    </View>
  )
}

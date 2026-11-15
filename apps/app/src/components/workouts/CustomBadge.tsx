import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../ui'
import { useTheme } from '../../theme/useTheme'

// Violet 700 / 400 ink on a 15% violet tint: about 6:1 in both themes. 600 measured 4.53:1 on the
// light page, a hair over AA for 12px text.
const INK = { light: '#6d28d9', dark: '#a78bfa' } as const

// `wide` and `border` are MuscleBadge's: the exercise page sets the badge among its tags.
export function CustomBadge({ className = '', wide = false, border = false }: { className?: string; wide?: boolean; border?: boolean }) {
  const { t } = useTranslation()
  const { mode } = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={t('exercises.custom.badgeLabel')}
      className={`self-start rounded bg-violet-500/15 py-0.5 ${wide ? 'px-2' : 'px-1.5'} ${border ? 'border border-violet-500/30' : ''} ${className}`}
    >
      <AppText variant="caption" style={{ color: INK[mode] }}>{t('exercises.custom.badge')}</AppText>
    </View>
  )
}

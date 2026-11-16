import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText } from '../ui'
import { useTheme } from '../../theme/useTheme'

// Violet 700 / 400 ink on a 15% violet tint: about 6:1 in both themes. 600 measured 4.53:1 on the
// light page, a hair over AA for 12px text.
const INK = { light: '#6d28d9', dark: '#a78bfa' } as const

// `pill` is MuscleBadge's: the exercise page sets the badge among its pill tags.
export function CustomBadge({ className = '', pill = false }: { className?: string; pill?: boolean }) {
  const { t } = useTranslation()
  const { mode } = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={t('exercises.custom.badgeLabel')}
      className={`bg-violet-500/15 ${pill ? 'rounded-full border border-violet-500/30 px-3 py-1' : 'self-start rounded px-1.5 py-0.5'} ${className}`}
    >
      <AppText variant="caption" style={{ color: INK[mode] }}>{t('exercises.custom.badge')}</AppText>
    </View>
  )
}

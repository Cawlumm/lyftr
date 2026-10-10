import { View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { semanticInk } from '../../theme/theme'
import { useTheme } from '../../theme/useTheme'
import { BarbellBroken } from './BarbellBroken'

// A stat tile whose figure could not be loaded. Mirrors web ui/StatFailure: the dropped
// barbell at tile-figure size, no words — the tile's own label already says what is
// missing, and a 0 in its place would claim a figure we never got.
export function StatFailure({ label }: { label?: string }) {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label ?? t('common.figureFailed')}>
      <BarbellBroken size={26} color={semanticInk[isDark ? 'dark' : 'light'].error} />
    </View>
  )
}

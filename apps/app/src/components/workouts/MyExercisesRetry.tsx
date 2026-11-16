import { Pressable, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText, interactive } from '../ui'
import { RefreshCw } from '../ui/icons'
import { useTheme } from '../../theme/useTheme'

// Shown where the user's own exercises would be when fetching them failed. Without it the group
// just vanishes, which reads as "you have none" and sends them to create a duplicate.
export function MyExercisesRetry({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  const { accent } = useTheme()
  return (
    <View className="flex-row items-center justify-between gap-3 px-1 py-1">
      <AppText variant="caption" color="muted" className="flex-1">{t('exercises.custom.loadFailed')}</AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className={`min-h-[44px] min-w-[44px] flex-row items-center gap-1.5 rounded-lg px-3 active:bg-surface-muted/60 ${interactive('hover:bg-surface-muted/60')}`}
      >
        <RefreshCw size={14} color={accent} />
        <AppText variant="bodySemibold" style={{ color: accent }}>{t('common.tryAgain')}</AppText>
      </Pressable>
    </View>
  )
}

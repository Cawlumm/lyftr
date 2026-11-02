import { Pressable, View } from 'react-native'
import { SlidersHorizontal } from 'lucide-react-native'
import { useTranslation } from '@lyftr/shared'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

interface Props {
  /** How many filters are on. Zero is the plain button; more lights it up with the count. */
  active: number
  onPress: () => void
}

// The button beside a search field that opens a FilterSheet. The count is on the button
// itself so what is narrowing the list is visible without opening anything. Mirrors web
// ui/FilterButton.
export function FilterButton({ active, onPress }: Props) {
  const { t } = useTranslation()
  const { accent, colors } = useTheme()
  const on = active > 0
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? t('filters.buttonActive', { active }) : t('filters.button')}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-xl border active:scale-95 ${
        on ? 'border-brand-500/40 bg-brand-500/15' : 'border-surface-border bg-surface-muted'
      }`}
    >
      <SlidersHorizontal size={16} color={on ? accent : colors.txMuted} strokeWidth={2.2} />
      {on ? (
        <View className="absolute -right-1.5 -top-1.5 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1">
          <AppText variant="caption" className="text-[11px] font-semibold" style={{ color: '#ffffff' }}>
            {active}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  )
}

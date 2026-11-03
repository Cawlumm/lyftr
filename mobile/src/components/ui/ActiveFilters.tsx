import { Pressable, ScrollView } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { X } from './icons'
import { type FilterGroup, type FilterValues, activeFilters, useTranslation } from '@lyftr/shared'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'

interface Props {
  groups: readonly FilterGroup[]
  values: FilterValues
  onRemove: (key: string) => void
}

// What is on, as removable chips under the search field, so a filter can be dropped in one
// tap without reopening the sheet. Renders nothing when nothing is on. Mirrors web
// ui/ActiveFilters.
export function ActiveFilters({ groups, values, onRemove }: Props) {
  const { t } = useTranslation()
  const { accent } = useTheme()
  const active = activeFilters(groups, values)
  if (active.length === 0) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t('filters.active')}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-1.5 px-4"
    >
      {active.map((f) => (
        <Animated.View
          key={f.key}
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(120)}
          layout={LinearTransition}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('filters.remove', { label: f.label })}
            onPress={() => onRemove(f.key)}
            hitSlop={6}
            className="flex-row items-center gap-1 rounded-full border border-brand-500/40 bg-brand-500/15 py-1.5 pl-3 pr-2 active:opacity-60"
          >
            <AppText variant="caption" color="brand" className="capitalize">{f.label}</AppText>
            <X size={12} color={accent} strokeWidth={2.4} />
          </Pressable>
        </Animated.View>
      ))}
    </ScrollView>
  )
}

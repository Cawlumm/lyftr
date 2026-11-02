import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import { Check, X } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { type FilterGroup, type FilterValues, activeFilterCount, useTranslation } from '@lyftr/shared'
import { useTheme } from '../../theme/useTheme'
import { AppText } from './Typography'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  groups: readonly FilterGroup[]
  values: FilterValues
  /** Fires with the option picked, or null when the one already on is picked again. */
  onChange: (key: string, value: string | null) => void
  onReset: () => void
  onClose: () => void
}

// The panel behind a FilterButton: one section per group, every option visible at once
// instead of scrolled past. Generic over `groups`, so a screen with other filters brings its
// own list and nothing here changes. Changes apply as they are made (the list updates behind
// the scrim); Done only closes. Mirrors web ui/FilterSheet.
export function FilterSheet({ open, groups, values, onChange, onReset, onClose }: Props) {
  const { t } = useTranslation()
  const { height } = useWindowDimensions()
  const { accent } = useTheme()
  const count = activeFilterCount(groups, values)

  return (
    <Sheet open={open} onClose={onClose} haptic="selection">
      <View className="flex-row items-center justify-between border-b border-surface-border px-5 pb-3 pt-1">
        <AppText variant="title">{t('filters.title')}</AppText>
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('filters.reset')}
            accessibilityState={{ disabled: count === 0 }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              onReset()
            }}
            disabled={count === 0}
            hitSlop={10}
            className={`active:opacity-60 ${count === 0 ? 'opacity-40' : ''}`}
          >
            <AppText variant="label" color="brand">{t('filters.reset')}</AppText>
          </Pressable>
          <IconButton icon={X} label={t('common.close')} variant="ghost" size="md" onPress={onClose} />
        </View>
      </View>

      <ScrollView style={{ maxHeight: height * 0.6 }} contentContainerClassName="gap-6 px-5 py-4">
        {groups.map((group) => (
          <View key={group.key} accessibilityLabel={group.label}>
            <View className="mb-2.5 flex-row items-baseline justify-between">
              <AppText variant="subheading">{group.label}</AppText>
              {values[group.key] != null ? (
                <AppText variant="caption" color="brand" className="capitalize">
                  {group.options.find((o) => o.value === values[group.key])?.label}
                </AppText>
              ) : null}
            </View>
            <View className="flex-row flex-wrap gap-2">
              {group.options.map((option) => {
                const on = values[group.key] === option.value
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {})
                      onChange(group.key, on ? null : option.value)
                    }}
                    className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2.5 active:scale-95 ${
                      on ? 'border-brand-500/40 bg-brand-500/15' : 'border-surface-border bg-surface-muted'
                    }`}
                  >
                    {on ? <Check size={14} color={accent} strokeWidth={2.6} /> : null}
                    <AppText variant="caption" color={on ? 'brand' : 'muted'} className="capitalize">
                      {option.label}
                    </AppText>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="border-t border-surface-border px-5 pt-3">
        <Button title={t('filters.done')} onPress={onClose} />
      </View>
    </Sheet>
  )
}

import { useId } from 'react'
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import { X } from './icons'
import * as Haptics from 'expo-haptics'
import { type FilterGroup, type FilterValues, activeFilterCount, useTranslation } from '@lyftr/shared'
import { AppText } from './Typography'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Sheet } from './Sheet'
import { FoldToggle, OPTION_FOLD, useFold } from './fold'
import { OptionChip } from './IconTileGroup'
import { TOUCH_MIN, interactive } from './interaction'

interface Props {
  open: boolean
  groups: readonly FilterGroup[]
  values: FilterValues
  /** Fires with the option picked, or null when the one already on is picked again. */
  onChange: (key: string, value: string | null) => void
  onReset: () => void
  onClose: () => void
}

// The panel behind a FilterButton: one section per group. A long section folds by OPTION_FOLD
// (fold.tsx), always showing the option that is on. Generic over `groups`, so a screen with other filters brings its
// own list and nothing here changes. Changes apply as they are made (the list updates behind
// the scrim); Done only closes. Mirrors web ui/FilterSheet.
export function FilterSheet({ open, groups, values, onChange, onReset, onClose }: Props) {
  const { t } = useTranslation()
  const { height } = useWindowDimensions()
  const count = activeFilterCount(groups, values)
  const titleId = useId()

  return (
    <Sheet open={open} onClose={onClose} haptic="selection" labelledBy={titleId} width="lg">
      <View className="flex-row items-center justify-between border-b border-surface-border px-5 pb-3 pt-1">
        <AppText nativeID={titleId} variant="title" headingLevel={2}>{t('filters.title')}</AppText>
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('filters.reset')}
            accessibilityState={{ disabled: count === 0 }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              onReset()
            }}
            disabled={count === 0}
            style={{ minHeight: TOUCH_MIN, minWidth: TOUCH_MIN }}
            className={`items-center justify-center rounded-lg px-2 ${count === 0 ? '' : `active:opacity-60 ${interactive('hover:bg-surface-muted/60')}`}`}
          >
            <AppText variant="bodySemibold" color={count === 0 ? 'muted' : 'brand'} className={count === 0 ? 'opacity-50' : ''}>{t('filters.reset')}</AppText>
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
                <AppText variant="caption" color="brand">
                  {group.options.find((o) => o.value === values[group.key])?.label}
                </AppText>
              ) : null}
            </View>
            <FilterOptions group={group} value={values[group.key]} onChange={onChange} />
          </View>
        ))}
      </ScrollView>

      <View className="border-t border-surface-border px-5 pt-3">
        <Button title={t('filters.done')} onPress={onClose} />
      </View>
    </Sheet>
  )
}

// One section's options; its own component so each section folds on its own.
function FilterOptions({ group, value, onChange }: { group: FilterGroup; value: string | null | undefined; onChange: Props['onChange'] }) {
  const fold = useFold(group.options, OPTION_FOLD, (o) => o.value === value)
  return (
    <View className="flex-row flex-wrap gap-2">
      {fold.shown.map((option) => {
        const on = value === option.value
        return (
          <OptionChip
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            label={option.label}
            on={on}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              onChange(group.key, on ? null : option.value)
            }}
          />
        )
      })}
      {fold.folds ? <FoldToggle open={fold.open} hidden={fold.hidden} onPress={fold.toggle} variant="chip" /> : null}
    </View>
  )
}

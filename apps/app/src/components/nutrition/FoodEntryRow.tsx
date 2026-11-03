import { formatLoggedAmount, useAsyncAction, useTranslation } from '@lyftr/shared'
import { useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { ChevronRight, Flame, MoreVertical } from '../ui/icons'
import type { FoodLog } from '@lyftr/shared'
import { ActionSheet, AppText, ConfirmSheet, IconButton, deleteAction, deleteConfirmProps, editAction, interactive } from '../ui'
import { linkProps } from '../ui/link'
import { useTheme } from '../../theme/useTheme'
import { client } from '../../lib/lyftr'
import { FoodThumb } from './FoodImage'
import { MACRO_TEXT, MEAL_COLORS, MEAL_ICONS, mealLabel, type Meal } from './nutritionMeta'

// Compact meal tag shown on each row now that meals share one list (icon + label in the
// meal's tint). 8-digit hex (#RRGGBBAA) for the fill/border is fine on RN core Views.
function MealChip({ meal }: { meal: Meal }) {
  useTranslation()
  const Icon = MEAL_ICONS[meal]
  const color = MEAL_COLORS[meal]
  return (
    <View className="flex-row items-center gap-1 rounded-full border px-2 py-0.5" style={{ backgroundColor: `${color}1A`, borderColor: `${color}40` }}>
      <Icon size={11} color={color} />
      <AppText variant="caption" style={{ fontSize: 10, color, fontWeight: '700' }}>{mealLabel(meal)}</AppText>
    </View>
  )
}

interface Props {
  entry: FoodLog
  /** First row in a meal has no top divider. */
  first: boolean
  /** Tap the row → the entry's view screen. */
  onPress: () => void
  /** Kebab → Edit → the shared log/edit flow. */
  onEdit: () => void
  /** Called after a successful server delete — the screen drops the row + refetches stats. */
  onDeleted: (id: number) => void
}

// A logged food entry row, mirroring WorkoutCard / ProgramCard: the row taps through to a
// view screen (which also has Edit/Delete top-right), AND a kebab (⋮) opens a native
// ActionSheet (Edit / Delete) with a thumbnail+macros preview header. Delete routes through
// the shared ConfirmSheet.
export function FoodEntryRow({ entry, first, onPress, onEdit, onDeleted }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // The catch here just put the card back - "a failed delete quietly restores the
  // card" - which is indistinguishable from a tap that never registered. The
  // confirm stays up now and says why it did not work.
  const remove = useAsyncAction(async () => {
    await client.foodAPI.delete(entry.id)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onDeleted(entry.id)
  }, t('food.entry.deleteFailed'))

  const Thumb = ({ size = 44 }: { size?: number }) => <FoodThumb src={entry.image_url} size={size} />

  const macroLine = (
    // Calories (flame) + each macro as a colored-dot chip (P/C/F), mirroring the dot
    // legend used on the entry-detail macro split. The color lives on the dot so the
    // grams read in plain text (the old all-colored "0g P 0g C 0g F" looked muddy), and
    // the dots give the eye three clear groups. gap-x-3 spaces them; flex-wrap lets a
    // huge value drop cleanly to a second line instead of clipping.
    <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <View className="flex-row items-center gap-1">
        <Flame size={12} color={colors.txMuted} />
        <AppText variant="caption" color="secondary" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>{Math.round(entry.calories)} kcal</AppText>
      </View>
      {([
        [t('food.macro.proteinInitial'), entry.protein, MACRO_TEXT.protein],
        [t('food.macro.carbsInitial'), entry.carbs, MACRO_TEXT.carbs],
        [t('food.macro.fatInitial'), entry.fat, MACRO_TEXT.fat],
      ] as const).map(([label, value, color]) => (
        <View key={label} className="flex-row items-center gap-1">
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
          <AppText variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>{value.toFixed(0)}g</AppText>
          <AppText variant="caption" color="muted">{label}</AppText>
        </View>
      ))}
      {entry.servings !== 1 ? <AppText variant="caption" color="muted">{formatLoggedAmount(entry)}</AppText> : null}
    </View>
  )

  const info = (
    <>
      <Thumb />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <AppText variant="bodySemibold" numberOfLines={1} className="flex-1">{entry.name}</AppText>
          <MealChip meal={entry.meal} />
        </View>
        {macroLine}
      </View>
    </>
  )

  const options = (
    <IconButton
      icon={MoreVertical}
      label={t('food.entry.optionsNamed', { name: entry.name })}
      variant="ghost"
      size="sm"
      onPress={() => setMenuOpen(true)}
      disabled={remove.busy}
    />
  )

  const sheets = (
    <>
      <ActionSheet
        open={menuOpen}
        layout="row"
        onClose={() => setMenuOpen(false)}
        header={
          <View className="flex-row items-center gap-3">
            <Thumb size={52} />
            <View className="flex-1">
              <AppText variant="subheading" numberOfLines={1}>{entry.name}</AppText>
              {macroLine}
            </View>
          </View>
        }
        actions={[
          editAction(() => onEdit()),
          deleteAction(() => setConfirming(true)),
        ]}
      />

      <ConfirmSheet
        {...deleteConfirmProps({ title: t('food.entry.deleteTitle'), name: entry.name })}
        open={confirming}
        busy={remove.busy}
        error={remove.error}
        onConfirm={() => { void remove.run() }}
        onCancel={() => { setConfirming(false); remove.reset() }}
      />
    </>
  )

  // Web: the row is a real link to the entry (middle-click, open in new tab), laid over the
  // row with the options button above it as a sibling, as LinkCard does: a button inside a
  // link is invalid.
  if (Platform.OS === 'web') {
    return (
      <View className={`flex-row items-center gap-3 px-4 py-3 hover:bg-surface-muted/50 ${first ? '' : 'border-t border-surface-border'}`}>
        <Pressable
          {...linkProps(`/nutrition/${entry.id}`, onPress)}
          accessibilityLabel={entry.name}
          style={StyleSheet.absoluteFill}
          className={interactive('', { inset: true })}
        />
        <View style={{ pointerEvents: 'none' }} className="min-w-0 flex-1 flex-row items-center gap-3">
          {info}
        </View>
        {options}
        <View style={{ pointerEvents: 'none' }}>
          <ChevronRight size={16} color={colors.txMuted} />
        </View>
        {sheets}
      </View>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted/50 ${first ? '' : 'border-t border-surface-border'}`}
    >
      {info}
      {options}
      <ChevronRight size={16} color={colors.txMuted} />

      {sheets}
    </Pressable>
  )
}

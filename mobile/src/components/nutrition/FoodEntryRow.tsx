import { useState } from 'react'
import { Image, Pressable, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { ChevronRight, MoreVertical, Utensils } from 'lucide-react-native'
import type { FoodLog } from '@lyftr/shared'
import { ActionSheet, AppText, ConfirmSheet, IconButton, deleteAction, deleteConfirmProps, editAction } from '../ui'
import { useTheme } from '../../theme/useTheme'
import { client } from '../../lib/lyftr'
import { MACRO_TEXT, MEAL_COLORS, MEAL_ICONS, MEAL_LABELS, type Meal } from './nutritionMeta'

// Compact meal tag shown on each row now that meals share one list (icon + label in the
// meal's tint). 8-digit hex (#RRGGBBAA) for the fill/border is fine on RN core Views.
function MealChip({ meal }: { meal: Meal }) {
  const Icon = MEAL_ICONS[meal]
  const color = MEAL_COLORS[meal]
  return (
    <View className="flex-row items-center gap-1 rounded-full border px-2 py-0.5" style={{ backgroundColor: `${color}1A`, borderColor: `${color}40` }}>
      <Icon size={11} color={color} />
      <AppText variant="caption" style={{ fontSize: 10, color, fontWeight: '700' }}>{MEAL_LABELS[meal]}</AppText>
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
  const { colors } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await client.foodAPI.delete(entry.id)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      onDeleted(entry.id)
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  const Thumb = ({ size = 44 }: { size?: number }) =>
    entry.image_url ? (
      <Image source={{ uri: entry.image_url }} style={{ width: size, height: size, borderRadius: 12 }} className="border border-surface-border" />
    ) : (
      <View style={{ width: size, height: size }} className="items-center justify-center rounded-xl border border-surface-border bg-surface-muted">
        <Utensils size={size * 0.45} color={colors.txMuted} style={{ opacity: 0.4 }} />
      </View>
    )

  const macroLine = (
    // Calories · then P/C/F grouped tighter (their colors, not dots, separate them)
    // so the whole line fits one row instead of wrapping the fat onto a second line.
    <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2">
      <AppText variant="caption" color="secondary" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>{Math.round(entry.calories)} kcal</AppText>
      <Dot />
      <View className="flex-row items-center gap-x-1.5">
        <AppText variant="caption" style={{ color: MACRO_TEXT.protein, fontVariant: ['tabular-nums'] }}>{entry.protein.toFixed(0)}g P</AppText>
        <AppText variant="caption" style={{ color: MACRO_TEXT.carbs, fontVariant: ['tabular-nums'] }}>{entry.carbs.toFixed(0)}g C</AppText>
        <AppText variant="caption" style={{ color: MACRO_TEXT.fat, fontVariant: ['tabular-nums'] }}>{entry.fat.toFixed(0)}g F</AppText>
      </View>
      {entry.servings !== 1 ? <AppText variant="caption" color="muted">× {entry.servings}</AppText> : null}
    </View>
  )

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted/50 ${first ? '' : 'border-t border-surface-border'}`}
    >
      <Thumb />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <AppText variant="bodySemibold" numberOfLines={1} className="flex-1">{entry.name}</AppText>
          <MealChip meal={entry.meal} />
        </View>
        {macroLine}
      </View>
      <IconButton
        icon={MoreVertical}
        label={`${entry.name} options`}
        variant="ghost"
        size="sm"
        onPress={() => setMenuOpen(true)}
        disabled={deleting}
      />
      <ChevronRight size={16} color={colors.txMuted} />

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
        {...deleteConfirmProps({ title: 'Delete entry?', subject: `"${entry.name}"` })}
        open={confirming}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </Pressable>
  )
}

function Dot() {
  return <AppText variant="caption" color="muted" style={{ fontSize: 10 }}>·</AppText>
}

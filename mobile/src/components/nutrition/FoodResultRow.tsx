import { useState } from 'react'
import { Image, Pressable, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { ChevronRight, MoreVertical, Utensils } from 'lucide-react-native'
import type { FoodSearchResult } from '@lyftr/shared'
import {
  ActionSheet, AppText, ConfirmSheet, IconButton, deleteAction, deleteConfirmProps,
} from '../ui'
import { useTheme } from '../../theme/useTheme'
import { client } from '../../lib/lyftr'
import { MACRO_TEXT } from './nutritionMeta'

interface Props {
  item: FoodSearchResult
  /** Tap the row → pick this food and go to the detail step. */
  onPress: () => void
  /**
   * The saved_foods row id, when this result came from Favorites. Its presence is what
   * puts the ⋮ menu on the row — Recent and search results are not owned by the user and
   * have nothing to delete.
   */
  savedFoodId?: number
  /** Called after a successful server delete so the screen can drop the row. */
  onDeleted?: (id: number) => void
  /**
   * Surface a failed delete. FoodEntryRow swallows this case, which leaves the row on
   * screen with no explanation — indistinguishable from a dead button, and #115 was
   * already a report about a missing affordance.
   */
  onDeleteFailed?: (message: string) => void
}

// The search / Recent / Favorites result row, extracted from the log screen so the delete
// path can be tested without rendering the whole flow.
//
// The menu mirrors FoodEntryRow: a ⋮ IconButton inside the row Pressable opening an
// ActionSheet, with Delete routed through the shared ConfirmSheet. Nesting the button in
// the Pressable is what that component already does and ships.
export function FoodResultRow({ item, onPress, savedFoodId, onDeleted, onDeleteFailed }: Props) {
  const { colors } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const deletable = savedFoodId !== undefined && onDeleted !== undefined

  const handleDelete = async () => {
    if (savedFoodId === undefined) return
    setDeleting(true)
    try {
      await client.savedFoodsAPI.delete(savedFoodId)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      onDeleted?.(savedFoodId)
    } catch {
      onDeleteFailed?.(`Couldn't remove ${item.name} from Favorites.`)
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <Pressable
      onPress={onPress}
      className="w-full flex-row items-center gap-3 border-b border-surface-border px-4 py-3.5 active:bg-surface-muted"
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} className="h-11 w-11 rounded-xl border border-surface-border" />
      ) : (
        <View className="h-11 w-11 items-center justify-center rounded-xl border border-surface-border bg-surface-muted">
          <Utensils size={20} color={colors.txMuted} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <AppText variant="bodySemibold" numberOfLines={1}>{item.name}</AppText>
        {item.brand ? <AppText variant="caption" color="muted" numberOfLines={1} className="mt-0.5">{item.brand}</AppText> : null}
        <View className="mt-1 flex-row flex-wrap items-center gap-x-1.5">
          <AppText variant="caption" color="secondary" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>{Math.round(item.calories)} kcal</AppText>
          <Dot />
          <AppText variant="caption" style={{ color: MACRO_TEXT.protein, fontVariant: ['tabular-nums'] }}>{item.protein.toFixed(0)}g P</AppText>
          <Dot />
          <AppText variant="caption" style={{ color: MACRO_TEXT.carbs, fontVariant: ['tabular-nums'] }}>{item.carbs.toFixed(0)}g C</AppText>
          <Dot />
          <AppText variant="caption" style={{ color: MACRO_TEXT.fat, fontVariant: ['tabular-nums'] }}>{item.fat.toFixed(0)}g F</AppText>
          {item.serving_size ? (<><Dot /><AppText variant="caption" color="muted" style={{ fontSize: 10 }}>{item.serving_size}</AppText></>) : null}
        </View>
      </View>

      {deletable ? (
        <IconButton
          icon={MoreVertical}
          label={`${item.name} options`}
          variant="ghost"
          size="sm"
          onPress={() => setMenuOpen(true)}
          disabled={deleting}
        />
      ) : null}
      <ChevronRight size={16} color={colors.txMuted} />

      {deletable ? (
        <>
          <ActionSheet
            open={menuOpen}
            title="Favorite"
            subtitle={item.name}
            onClose={() => setMenuOpen(false)}
            actions={[deleteAction(() => setConfirming(true), 'Remove from Favorites')]}
          />
          <ConfirmSheet
            {...deleteConfirmProps({ title: 'Remove from Favorites?', subject: `"${item.name}"` })}
            confirmLabel="Remove"
            busyLabel="Removing…"
            open={confirming}
            busy={deleting}
            onConfirm={handleDelete}
            onCancel={() => setConfirming(false)}
          />
        </>
      ) : null}
    </Pressable>
  )
}

function Dot() {
  return <AppText variant="caption" color="muted" style={{ fontSize: 10 }}>·</AppText>
}

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { format, parseISO } from 'date-fns'
import * as Haptics from 'expo-haptics'
import { ChevronRight, MoreVertical, Scale, TrendingDown, TrendingUp } from 'lucide-react-native'
import { displayWeight, weightShort, type WeightLog } from '@lyftr/shared'
import { ActionSheet, AppText, ConfirmSheet, IconButton, deleteAction, deleteConfirmProps, editAction } from '../ui'
import { useTheme } from '../../theme/useTheme'
import { client } from '../../lib/lyftr'

interface Props {
  item: WeightLog
  /** The next (older) entry, for the day-over-day delta chip. */
  next?: WeightLog
  unit: 'lbs' | 'kg'
  /** Called after a successful server delete — the screen reloads list + stats + chart. */
  onDeleted: (id: number) => void
}

// A weight history row, mirroring WorkoutCard / ProgramCard: the row taps through to the
// detail (which also has Edit/Delete top-right), AND a kebab (⋮) opens a native ActionSheet
// (Edit / Delete). Edit deep-links the detail straight into its inline edit form (?edit=1);
// Delete routes through the shared ConfirmSheet.
export function WeightEntryRow({ item, next, unit, onDeleted }: Props) {
  const { colors, accent, brand } = useTheme()
  const wUnit = weightShort(unit)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const deltaLbs = next ? item.weight - next.weight : 0
  const displayW = displayWeight(item.weight, unit)
  const displayDelta = displayWeight(Math.abs(deltaLbs), unit)
  const dateLabel = format(parseISO(item.logged_at), 'MMM d, yyyy')

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await client.weightAPI.delete(item.id)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      onDeleted(item.id)
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <View className="mb-2 flex-row items-center gap-2">
      <Pressable
        onPress={() => router.push(`/weight/${item.id}`)}
        className="min-w-0 flex-1 flex-row items-center gap-3 rounded-2xl border border-surface-border bg-surface-raised p-4 active:scale-[0.99]"
      >
        <View className="h-11 w-11 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
          <Scale size={20} color={accent} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-sans-semibold text-sm text-tx-primary" style={{ fontVariant: ['tabular-nums'] }}>
            {Math.round(displayW)} {wUnit}
          </Text>
          <AppText variant="caption" color="muted" className="mt-0.5">{dateLabel}</AppText>
          {deltaLbs !== 0 || item.notes ? (
            <View className="mt-0.5 flex-row items-center gap-x-2 overflow-hidden">
              {deltaLbs !== 0 ? (
                <View className="flex-row items-center gap-0.5">
                  {deltaLbs < 0 ? <TrendingDown size={12} color={brand.successSoft} /> : <TrendingUp size={12} color={brand.errorSoft} />}
                  <Text className="font-sans-medium text-xs" style={{ color: deltaLbs < 0 ? brand.successSoft : brand.errorSoft, fontVariant: ['tabular-nums'] }}>
                    {Math.round(displayDelta)}
                  </Text>
                </View>
              ) : null}
              {deltaLbs !== 0 && item.notes ? <AppText variant="caption" color="muted">·</AppText> : null}
              {item.notes ? <AppText variant="caption" color="muted" numberOfLines={1} className="flex-1">{item.notes}</AppText> : null}
            </View>
          ) : null}
        </View>
        <ChevronRight size={16} color={colors.txMuted} />
      </Pressable>
      <IconButton
        icon={MoreVertical}
        label={`${Math.round(displayW)} ${wUnit} options`}
        variant="ghost"
        size="sm"
        onPress={() => setMenuOpen(true)}
        disabled={deleting}
      />

      <ActionSheet
        open={menuOpen}
        layout="row"
        onClose={() => setMenuOpen(false)}
        header={
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
              <Scale size={20} color={accent} />
            </View>
            <View className="flex-1">
              <AppText variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(displayW)} {wUnit}</AppText>
              <AppText variant="caption" color="muted" numberOfLines={1} className="mt-0.5">
                {dateLabel}{item.notes ? ` · ${item.notes}` : ''}
              </AppText>
            </View>
          </View>
        }
        actions={[
          editAction(() => router.push(`/weight/${item.id}?edit=1`)),
          deleteAction(() => setConfirming(true)),
        ]}
      />

      <ConfirmSheet
        {...deleteConfirmProps({ title: 'Delete Entry?', subject: `${dateLabel} · ${Math.round(displayW)} ${wUnit}` })}
        open={confirming}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </View>
  )
}

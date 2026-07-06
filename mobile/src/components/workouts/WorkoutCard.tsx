import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { format } from 'date-fns'
import { ChevronRight, Clock, Dumbbell, MoreVertical, TrendingUp } from 'lucide-react-native'
import { displayVolume, type Workout } from '@lyftr/shared'
import { ActionSheet, AppText, Card, ConfirmSheet, IconButton, deleteAction, deleteConfirmProps, editAction } from '../ui'
import { useTheme } from '../../theme/useTheme'
import { client } from '../../lib/lyftr'
import { ExerciseImage } from './ExerciseImage'

interface Props {
  workout: Workout
  /** Display unit short label ('lb' | 'kg') — volume converts from server lbs. */
  unit: string
  onPress: () => void
  /** Called after a successful server delete — the screen reloads the list (web parity). */
  onDeleted: (id: number) => void
}

// Purpose-built card (richer than ListRow): thumbnail, name/date/meta lines, chevron
// AND a kebab (⋮) menu. Mirrors the web card's mobile kebab → options (Edit / Delete);
// the menu is a native ActionSheet and Delete routes through the shared ConfirmSheet.
export function WorkoutCard({ workout, unit, onPress, onDeleted }: Props) {
  const { colors } = useTheme()
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const durationMin = Math.round(workout.duration / 60)
  // The meta line has ~3 items competing for one row next to the trash/chevron
  // gutter — compact big volumes ("18.7k") so nothing truncates or wraps.
  const compact = (n: number) =>
    n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n.toLocaleString()
  const totalVolume = displayVolume(
    workout.exercises?.reduce(
      (total, e) => total + (e.sets?.reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0) || 0),
      0
    ) || 0,
    unit
  )

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await client.workoutAPI.delete(workout.id)
      onDeleted(workout.id)
    } catch {
      // Web parity: a failed delete quietly restores the card.
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:scale-[0.99]">
      <Card className="flex-row items-center gap-3 rounded-2xl">
        <ExerciseImage url={workout.exercises?.[0]?.exercise?.image_url} />
        <View className="flex-1">
          <AppText variant="subheading" numberOfLines={1}>{workout.name}</AppText>
          {/* Two balanced meta lines instead of one overloaded row: date + duration,
              then exercises + volume — three items on one line truncated at 390pt. */}
          <View className="flex-row items-center gap-x-2 mt-0.5">
            <AppText variant="caption" color="muted" numberOfLines={1}>
              {format(new Date(workout.started_at), 'MMM d, yyyy')}
            </AppText>
            {durationMin > 0 && (
              <>
                <AppText variant="caption" color="muted">·</AppText>
                <View className="flex-row items-center gap-1">
                  <Clock size={12} color={colors.txMuted} />
                  <AppText variant="caption" color="muted">{durationMin} min</AppText>
                </View>
              </>
            )}
          </View>
          <View className="flex-row items-center gap-x-2 mt-0.5">
            {/* Dumbbell = exercises (shared icon taxonomy with ProgramCard + both detail strips). */}
            <View className="flex-row items-center gap-1">
              <Dumbbell size={12} color={colors.txMuted} />
              <AppText variant="caption" color="muted" numberOfLines={1}>
                {workout.exercises?.length || 0} exercises
              </AppText>
            </View>
            {totalVolume > 0 && (
              <>
                <AppText variant="caption" color="muted">·</AppText>
                <View className="flex-row items-center gap-1 flex-shrink">
                  <TrendingUp size={12} color={colors.txMuted} />
                  <AppText variant="caption" color="muted" numberOfLines={1}>
                    {compact(totalVolume)} {unit}
                  </AppText>
                </View>
              </>
            )}
          </View>
        </View>
        {/* Kebab (⋮) options menu — the native pattern other apps use. A muted glyph
            keeps the row reading as tap-to-open media; the ActionSheet holds Edit +
            Delete, and Delete still routes through the ConfirmSheet. */}
        <IconButton
          icon={MoreVertical}
          label={`${workout.name} options`}
          variant="ghost"
          size="sm"
          onPress={() => setMenuOpen(true)}
          disabled={deleting}
        />
        <ChevronRight size={16} color={colors.txMuted} />
      </Card>

      <ActionSheet
        open={menuOpen}
        layout="row"
        onClose={() => setMenuOpen(false)}
        // Rich header: a preview of the workout being acted on (thumbnail + meta),
        // so the sheet isn't a bare pair of buttons.
        header={
          <View className="flex-row items-center gap-3">
            <ExerciseImage url={workout.exercises?.[0]?.exercise?.image_url} size="hero" />
            <View className="flex-1">
              <AppText variant="subheading" numberOfLines={1}>{workout.name}</AppText>
              <AppText variant="caption" color="muted" numberOfLines={1} className="mt-0.5">
                {format(new Date(workout.started_at), 'MMM d, yyyy')}
                {durationMin > 0 ? ` · ${durationMin} min` : ''}
                {` · ${workout.exercises?.length || 0} exercises`}
              </AppText>
              {totalVolume > 0 ? (
                <View className="mt-1.5 flex-row items-center gap-1">
                  <TrendingUp size={12} color={colors.txMuted} />
                  <AppText variant="caption" color="muted">{compact(totalVolume)} {unit} total volume</AppText>
                </View>
              ) : null}
            </View>
          </View>
        }
        actions={[
          editAction(() => router.push(`/workouts/${workout.id}/edit`)),
          deleteAction(() => setConfirming(true)),
        ]}
      />

      <ConfirmSheet
        {...deleteConfirmProps({ title: 'Delete Workout?', subject: `"${workout.name}"` })}
        open={confirming}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </Pressable>
  )
}

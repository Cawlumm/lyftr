import { useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { format } from 'date-fns'
import { ChevronRight, Clock, TrendingUp, Trash2 } from 'lucide-react-native'
import { displayVolume, type Workout } from '@lyftr/shared'
import { AppText, Card, IconButton } from '../ui'
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
// AND a delete action. The web's mobile kebab→portal menu + inline confirm collapses
// to a trash IconButton + the OS Alert confirm (weight.tsx precedent) — Edit stays
// reachable from the detail screen instead of a per-card menu.
export function WorkoutCard({ workout, unit, onPress, onDeleted }: Props) {
  const { colors } = useTheme()
  const [deleting, setDeleting] = useState(false)

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

  const confirmDelete = () => {
    Alert.alert(`Delete "${workout.name}"?`, 'This cannot be undone', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true)
          try {
            await client.workoutAPI.delete(workout.id)
            onDeleted(workout.id)
          } catch {
            // Web parity: a failed delete quietly restores the card.
            setDeleting(false)
          }
        },
      },
    ])
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
            <AppText variant="caption" color="muted" numberOfLines={1}>
              {workout.exercises?.length || 0} exercises
            </AppText>
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
        {/* De-emphasized destructive action: a muted glyph (not a loud red box)
            keeps the row reading as tap-to-open media, native-list style. The OS
            Alert still gates the actual delete, so discoverability is preserved. */}
        <IconButton
          icon={Trash2}
          label={`Delete ${workout.name}`}
          variant="ghost"
          size="sm"
          onPress={confirmDelete}
          disabled={deleting}
        />
        <ChevronRight size={16} color={colors.txMuted} />
      </Card>
    </Pressable>
  )
}

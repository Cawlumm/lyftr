import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { format } from 'date-fns'
import { BookOpen, ChevronRight, Dumbbell, Layers, MoreVertical, Play } from 'lucide-react-native'
import type { ActiveSessionExercise, Program } from '@lyftr/shared'
import { ActionSheet, AppText, Card, ConfirmSheet, IconButton, deleteAction, deleteConfirmProps, editAction } from '../ui'
import { useTheme } from '../../theme/useTheme'
import { client, useWorkoutSession } from '../../lib/lyftr'
import { ExerciseImage } from '../workouts/ExerciseImage'

interface Props {
  program: Program
  onPress: () => void
  /** Called after a successful server delete — the screen reloads the list (web parity). */
  onDeleted: (id: number) => void
}

// Active-session routes live in the workouts stack (start / active); cast to Href the
// same way the other cross-stack links do.
const startHref = '/workouts/start' as unknown as Href
const activeHref = '/workouts/active' as unknown as Href

// Program equivalent of WorkoutCard: thumbnail, name/date/meta, a filled Play button
// (the primary Start action), a kebab (⋮) ActionSheet (Edit / Delete — same as
// WorkoutCard), and a chevron. Delete routes through the shared ConfirmSheet.
export function ProgramCard({ program, onPress, onDeleted }: Props) {
  const { colors } = useTheme()
  const { session, startSession } = useWorkoutSession()
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const exCount = program.exercises?.length || 0
  const totalSets = program.exercises?.reduce((s, e) => s + (e.sets?.length || 0), 0) || 0

  // 1:1 with web: an existing session takes priority (resume/discard on the start
  // screen); otherwise seed a session from the program's targets and open it.
  const handleStart = () => {
    // navigate (not push): programs → workouts is a cross-tab jump; push corrupts the
    // native tab/back stack (the "can't get off the workout from a program" bug).
    if (session) { router.navigate(startHref); return }
    const exercises: ActiveSessionExercise[] = (program.exercises || []).map((ex) => ({
      exercise_id: ex.exercise_id,
      exercise: ex.exercise,
      notes: ex.notes || '',
      rest_seconds: ex.rest_seconds,
      sets: (ex.sets || []).map((s) => ({
        set_number: s.set_number,
        target_reps: s.target_reps,
        target_weight: s.target_weight,
        actual_reps: s.target_reps,
        actual_weight: s.target_weight,
        completed: false,
        program_set_id: s.id,
      })),
    }))
    startSession(program.name, exercises, program.id)
    router.navigate(activeHref)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await client.programAPI.delete(program.id)
      onDeleted(program.id)
    } catch {
      // Web parity: a failed delete quietly restores the card.
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:scale-[0.99]">
      <Card className="flex-row items-center gap-3 rounded-2xl">
        <ExerciseImage url={program.exercises?.[0]?.exercise?.image_url} fallbackIcon={BookOpen} />
        <View className="flex-1">
          <AppText variant="subheading" numberOfLines={1}>{program.name}</AppText>
          <AppText variant="caption" color="muted" numberOfLines={1} className="mt-0.5">
            {format(new Date(program.created_at), 'MMM d, yyyy')}
          </AppText>
          {/* Metric chips with leading icons — shared taxonomy with WorkoutCard:
              Dumbbell = exercises, Layers = sets. */}
          <View className="mt-0.5 flex-row items-center gap-x-2">
            <View className="flex-row items-center gap-1">
              <Dumbbell size={12} color={colors.txMuted} />
              <AppText variant="caption" color="muted" numberOfLines={1}>{exCount} exercises</AppText>
            </View>
            <AppText variant="caption" color="muted">·</AppText>
            <View className="flex-row items-center gap-1">
              <Layers size={12} color={colors.txMuted} />
              <AppText variant="caption" color="muted" numberOfLines={1}>{totalSets} sets</AppText>
            </View>
          </View>
        </View>
        {/* Start is the card's primary action → a filled Play button on the row
            (Hevy/Strong pattern: 1-tap start from the list), kept out of the ⋮ menu. */}
        <IconButton
          icon={Play}
          label={`Start ${program.name}`}
          variant="solid"
          size="sm"
          onPress={handleStart}
          disabled={deleting}
        />
        <IconButton
          icon={MoreVertical}
          label={`${program.name} options`}
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
        header={
          <View className="flex-row items-center gap-3">
            <ExerciseImage url={program.exercises?.[0]?.exercise?.image_url} size="hero" fallbackIcon={BookOpen} />
            <View className="flex-1">
              <AppText variant="subheading" numberOfLines={1}>{program.name}</AppText>
              <AppText variant="caption" color="muted" numberOfLines={1} className="mt-0.5">
                {exCount} exercises · {totalSets} sets
              </AppText>
            </View>
          </View>
        }
        actions={[
          editAction(() => router.push(`/programs/${program.id}/edit`)),
          deleteAction(() => setConfirming(true)),
        ]}
      />

      <ConfirmSheet
        {...deleteConfirmProps({ title: 'Delete Program?', subject: `"${program.name}"` })}
        open={confirming}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </Pressable>
  )
}

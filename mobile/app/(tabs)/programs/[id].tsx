import { useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { format } from 'date-fns'
import {
  AlertCircle, ArrowLeft, BookOpen, ChevronRight, Dumbbell, Edit2, Layers, Pause, Play, TimerOff, Trash2,
} from 'lucide-react-native'
import {
  apiErrorMessage, displayWeight, weightShort,
  type ActiveSessionExercise, type Program, type ProgramSet,
} from '@lyftr/shared'
import { AppText, ConfirmSheet, Loading, Screen, deleteConfirmProps } from '../../../src/components/ui'
import { ExerciseImage } from '../../../src/components/workouts/ExerciseImage'
import { client, useSettingsStore, useWorkoutSession } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'
import { muscleColor } from '../../../src/utils/exerciseUtils'

// Exercise-detail leaf, routed INSIDE the Programs stack (programs/exercise/[exerciseId])
// so back returns to this program — pushing the workouts-tab copy would jump tabs and
// strand the back stack. Both routes render the shared ExerciseDetailScreen.
const exerciseHref = (exerciseId: number) => `/programs/exercise/${exerciseId}` as unknown as Href
const startHref = '/workouts/start' as unknown as Href
const activeHref = '/workouts/active' as unknown as Href

const restLabel = (s: number) => (s % 60 === 0 && s >= 60 ? `${s / 60}m` : `${s}s`)

function SetChip({ set, isBest, unit }: { set: ProgramSet; isBest: boolean; unit: string }) {
  return (
    <View
      className={`px-2.5 py-1.5 rounded-lg ${
        isBest ? 'bg-brand-500/15 border border-brand-500/25' : 'bg-surface-raised border border-transparent'
      }`}
    >
      <AppText variant="caption" color={isBest ? 'brand' : 'secondary'} style={{ fontVariant: ['tabular-nums'] }}>
        {set.target_reps > 0 ? set.target_reps : '—'} ×{' '}
        {set.target_weight > 0 ? `${displayWeight(set.target_weight, unit)} ${unit}` : 'BW'}
      </AppText>
    </View>
  )
}

function MuscleBadge({ muscle }: { muscle: string }) {
  const { colors } = useTheme()
  const tint = muscleColor(muscle)
  return (
    <View className={`px-1.5 py-0.5 rounded ${tint?.chip ?? 'bg-surface-muted'}`}>
      <AppText variant="caption" style={{ color: tint?.text ?? colors.txMuted }}>{muscle}</AppText>
    </View>
  )
}

export default function ProgramDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const wUnit = weightShort(settings.weight_unit)
  const restOn = settings.rest_enabled ?? true
  const { session, startSession } = useWorkoutSession()
  const { colors, brand, accent, isDark } = useTheme()

  const [program, setProgram] = useState<Program | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await client.programAPI.get(Number(id))
        if (!cancelled) setProgram(data)
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, 'Failed to load program'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/programs'))

  const handleStart = () => {
    if (!program) return
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
    if (!program) return
    setDeleting(true)
    try {
      await client.programAPI.delete(program.id)
      goBack() // list refetches on focus
    } catch {
      setDeleting(false)
    }
  }

  if (loading) return <Loading />

  if (error || !program) {
    return (
      <Screen>
        <View className="gap-4 py-4">
          <Pressable onPress={goBack} hitSlop={8} className="flex-row items-center gap-2 self-start active:opacity-60">
            <ArrowLeft size={16} color={colors.txMuted} />
            <AppText variant="body" color="muted">Back</AppText>
          </Pressable>
          <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 p-4">
            <AlertCircle size={20} color={isDark ? brand.errorSoft : brand.error} />
            <AppText variant="body" color="error" className="flex-1">{error || 'Program not found'}</AppText>
          </View>
        </View>
      </Screen>
    )
  }

  const exs = program.exercises ?? []
  const totalSets = exs.reduce((s, ex) => s + (ex.sets ?? []).length, 0)

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="gap-5 py-4">
          {/* Back nav + actions */}
          <View className="flex-row items-center justify-between">
            <Pressable onPress={goBack} hitSlop={8} className="flex-row items-center gap-1.5 active:opacity-60">
              <ArrowLeft size={16} color={colors.txMuted} />
              <AppText variant="body" color="muted">Programs</AppText>
            </Pressable>
            <View className="flex-row items-center gap-2">
              {/* Start is the primary action → filled brand pill; Edit brand outline;
                  Delete a quiet ghost glyph that only reddens at the confirm step. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start workout"
                onPress={handleStart}
                hitSlop={6}
                className="h-9 flex-row items-center gap-1.5 rounded-lg bg-brand-500 px-3 active:scale-95"
              >
                <Play size={14} color="#ffffff" strokeWidth={2.2} />
                <AppText variant="label" color="white">Start</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit program"
                onPress={() => router.push(`/programs/${program.id}/edit`)}
                hitSlop={6}
                className="h-9 flex-row items-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 active:scale-95"
              >
                <Edit2 size={15} color={accent} strokeWidth={2.2} />
                <AppText variant="label" style={{ color: accent }}>Edit</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete program"
                onPress={() => setConfirming(true)}
                disabled={deleting}
                hitSlop={6}
                className={`h-9 w-9 items-center justify-center rounded-lg active:bg-error-500/10 ${deleting ? 'opacity-40' : ''}`}
              >
                <Trash2 size={17} color={colors.txMuted} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          <ConfirmSheet
            {...deleteConfirmProps({ title: 'Delete Program?', subject: `"${program.name}"` })}
            open={confirming}
            busy={deleting}
            onConfirm={handleDelete}
            onCancel={() => setConfirming(false)}
          />

          {/* Header card */}
          <View className="bg-surface-raised border border-surface-border rounded-2xl p-4">
            <View className="flex-row items-start gap-3">
              <ExerciseImage url={exs[0]?.exercise?.image_url} size="hero" fallbackIcon={BookOpen} />
              <View className="flex-1">
                <AppText variant="heading">{program.name}</AppText>
                <AppText variant="body" color="muted" className="mt-0.5">
                  Created {format(new Date(program.created_at), 'MMMM d, yyyy')}
                </AppText>
              </View>
            </View>

            {/* Stats strip: Exercises / Total Sets */}
            <View className="flex-row mt-4 pt-4 border-t border-surface-border">
              <View className="flex-1 items-center">
                <View className="flex-row items-center gap-1 mb-0.5">
                  <Dumbbell size={13} color={colors.txMuted} />
                  <AppText variant="caption" color="muted">Exercises</AppText>
                </View>
                <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{exs.length}</AppText>
              </View>
              <View className="flex-1 items-center border-l border-surface-border">
                <View className="flex-row items-center gap-1 mb-0.5">
                  <Layers size={13} color={colors.txMuted} />
                  <AppText variant="caption" color="muted">Total Sets</AppText>
                </View>
                <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{totalSets}</AppText>
              </View>
            </View>

            {program.notes ? (
              <View className="mt-3 pt-3 border-t border-surface-border">
                <AppText variant="body" color="muted">{program.notes}</AppText>
              </View>
            ) : null}
          </View>

          {/* Exercises */}
          {!restOn && (
            <View className="flex-row items-center gap-1.5 px-1">
              <TimerOff size={13} color={colors.txMuted} />
              <AppText variant="caption" color="muted">Rest timer is off — turn it on in Settings</AppText>
            </View>
          )}
          <View className="gap-3">
            {exs.map((ex) => {
              const sets = ex.sets ?? []
              const maxTargetLbs = sets.length > 0 ? Math.max(...sets.map((s) => s.target_weight || 0)) : 0
              const maxTarget = displayWeight(maxTargetLbs, wUnit)

              return (
                <Pressable
                  key={ex.id ?? ex.exercise_id}
                  accessibilityRole="button"
                  onPress={() => router.push(exerciseHref(ex.exercise_id))}
                  className="bg-surface-raised border border-surface-border rounded-2xl overflow-hidden active:scale-[0.99]"
                >
                  <View className="flex-row items-center gap-3 p-4">
                    <ExerciseImage url={ex.exercise?.image_url} />
                    <View className="flex-1">
                      <AppText variant="subheading" numberOfLines={1}>{ex.exercise?.name}</AppText>
                      <View className="flex-row items-center gap-2 mt-0.5">
                        {ex.exercise?.muscle_group ? <MuscleBadge muscle={ex.exercise.muscle_group} /> : null}
                        <AppText variant="caption" color="muted" numberOfLines={1} className="flex-shrink">
                          {sets.length} sets{maxTarget > 0 ? ` · target ${maxTarget} ${wUnit}` : ''}
                        </AppText>
                      </View>
                    </View>
                    <ChevronRight size={16} color={colors.txMuted} />
                  </View>

                  {sets.length > 0 && (
                    <View className="flex-row items-center gap-2 px-4 pb-4 pt-3 border-t border-surface-border/50">
                      <View className="flex-1 flex-row flex-wrap gap-1.5">
                        {sets.map((set, i) => (
                          <SetChip key={i} set={set} isBest={set.target_weight === maxTargetLbs && maxTargetLbs > 0} unit={wUnit} />
                        ))}
                      </View>
                      {restOn && (
                        ex.rest_seconds === 0 ? (
                          <AppText variant="caption" color="muted">No rest</AppText>
                        ) : (
                          <View className="flex-row items-center gap-1">
                            <Pause size={13} color={colors.txMuted} />
                            <AppText variant="caption" color="muted">{restLabel(ex.rest_seconds ?? 90)}</AppText>
                          </View>
                        )
                      )}
                    </View>
                  )}
                </Pressable>
              )
            })}
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

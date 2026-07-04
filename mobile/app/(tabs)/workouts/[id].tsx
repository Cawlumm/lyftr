import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { format } from 'date-fns'
import {
  AlertCircle, ArrowLeft, ChevronRight, Clock, Dumbbell, Edit2, Pause, TimerOff, Trash2, TrendingUp,
} from 'lucide-react-native'
import {
  apiErrorMessage, displayVolume, displayWeight, weightShort,
  type Workout, type Set as WorkoutSet,
} from '@lyftr/shared'
import { AppText, ConfirmSheet, Screen } from '../../../src/components/ui'
import { ExerciseImage } from '../../../src/components/workouts/ExerciseImage'
import { client, useSettingsStore } from '../../../src/lib/lyftr'
import { useTheme } from '../../../src/theme/useTheme'
import { muscleColor } from '../../../src/utils/exerciseUtils'

// TODO(phase-2.5): exercise-detail screen. Until it lands this opens expo-router's
// built-in Unmatched Route screen (deliberate — the nav is wired, back recovers).
const exerciseHref = (exerciseId: number) => `/workouts/exercise/${exerciseId}` as unknown as Href

const restLabel = (s: number) => (s % 60 === 0 && s >= 60 ? `${s / 60}m` : `${s}s`)

function SetChip({ set, isBest, unit }: { set: WorkoutSet; isBest: boolean; unit: string }) {
  return (
    // Web's ring-1 → a real border; non-best chips get border-transparent so both
    // states are the same size (RN borders take layout space, rings don't).
    <View
      className={`px-2.5 py-1.5 rounded-lg ${
        isBest ? 'bg-brand-500/15 border border-brand-500/25' : 'bg-surface-raised border border-transparent'
      }`}
    >
      <AppText
        variant="caption"
        color={isBest ? 'brand' : 'secondary'}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {set.reps > 0 ? set.reps : '—'} × {set.weight > 0 ? `${displayWeight(set.weight, unit)} ${unit}` : 'BW'}
      </AppText>
    </View>
  )
}

function MuscleBadge({ muscle }: { muscle: string }) {
  const { colors } = useTheme()
  const tint = muscleColor(muscle)
  return (
    <View className={`px-1.5 py-0.5 rounded ${tint?.chip ?? 'bg-surface-muted'}`}>
      {/* Tint via inline style — see exerciseUtils.ts for why not a className. */}
      <AppText variant="caption" style={{ color: tint?.text ?? colors.txMuted }}>
        {muscle}
      </AppText>
    </View>
  )
}

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const wUnit = weightShort(settings.weight_unit)
  const restOn = settings.rest_enabled ?? true
  const { colors, brand, accent, isDark } = useTheme()

  const [workout, setWorkout] = useState<Workout | null>(null)
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
        const data = await client.workoutAPI.get(Number(id))
        if (!cancelled) setWorkout(data)
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, 'Failed to load workout'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  // Deep links can land here with no history — fall back to the list route.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/workouts'))

  // Web's portal bottom-sheet confirm, ported 1:1 to a slide-up ConfirmSheet
  // (replaces the interim OS Alert) — closer to the web app the user knows.
  const handleDelete = async () => {
    if (!workout) return
    setDeleting(true)
    try {
      await client.workoutAPI.delete(workout.id)
      goBack() // list refetches on focus
    } catch {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={accent} />
      </Screen>
    )
  }

  if (error || !workout) {
    return (
      <Screen>
        <View className="gap-4 py-4">
          <Pressable onPress={goBack} hitSlop={8} className="flex-row items-center gap-2 self-start active:opacity-60">
            <ArrowLeft size={16} color={colors.txMuted} />
            <AppText variant="body" color="muted">Back</AppText>
          </Pressable>
          {/* Boxed request-error alert (authui AuthError pattern) */}
          <View className="flex-row items-center gap-2 rounded-xl border border-error-500/20 bg-error-500/10 p-4">
            <AlertCircle size={20} color={isDark ? brand.errorSoft : brand.error} />
            <AppText variant="body" color="error" className="flex-1">
              {error || 'Workout not found'}
            </AppText>
          </View>
        </View>
      </Screen>
    )
  }

  const exs = workout.exercises ?? []
  const totalVolume = displayVolume(
    exs.reduce((s, ex) => s + (ex.sets ?? []).reduce((ss, set) => ss + set.reps * set.weight, 0), 0),
    wUnit
  )
  const totalSets = exs.reduce((s, ex) => s + (ex.sets ?? []).length, 0)
  const durationMin = Math.round(workout.duration / 60)

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="gap-5 py-4">
          {/* Back nav + actions (web's top row) */}
          <View className="flex-row items-center justify-between">
            <Pressable onPress={goBack} hitSlop={8} className="flex-row items-center gap-1.5 active:opacity-60">
              <ArrowLeft size={16} color={colors.txMuted} />
              <AppText variant="body" color="muted">Workouts</AppText>
            </Pressable>
            <View className="flex-row items-center gap-2">
              {/* Clear hierarchy over two competing colored squares: Edit is the
                  primary action, so it gets a labeled brand pill; Delete stays a
                  quiet ghost glyph and only turns red at the confirm step (Alert).
                  Both are h-9 so they read as a matched pair. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit workout"
                onPress={() => router.push(`/workouts/${workout.id}/edit`)}
                hitSlop={6}
                className="h-9 flex-row items-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 active:scale-95"
              >
                <Edit2 size={15} color={accent} strokeWidth={2.2} />
                <AppText variant="label" style={{ color: accent }}>Edit</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete workout"
                onPress={() => setConfirming(true)}
                disabled={deleting}
                hitSlop={6}
                className={`h-9 w-9 items-center justify-center rounded-lg active:bg-error-500/10 ${deleting ? 'opacity-40' : ''}`}
              >
                <Trash2 size={17} color={colors.txMuted} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          {/* Delete confirm — slide-up bottom sheet (mirrors web's portal sheet). */}
          <ConfirmSheet
            open={confirming}
            title="Delete Workout?"
            message={`"${workout.name}" will be permanently deleted.`}
            confirmLabel="Delete"
            busyLabel="Deleting…"
            destructive
            icon={Trash2}
            busy={deleting}
            onConfirm={handleDelete}
            onCancel={() => setConfirming(false)}
          />

          {/* Header card */}
          <View className="bg-surface-raised border border-surface-border rounded-2xl p-4">
            <View className="flex-row items-start gap-3">
              <ExerciseImage url={exs[0]?.exercise?.image_url} size="hero" />
              <View className="flex-1">
                <AppText variant="heading">{workout.name}</AppText>
                <AppText variant="body" color="muted" className="mt-0.5">
                  {format(new Date(workout.started_at), 'EEEE, MMMM d, yyyy')}
                </AppText>
              </View>
            </View>

            {/* Stats strip: Duration / Sets / Volume */}
            <View className="flex-row mt-4 pt-4 border-t border-surface-border">
              <View className="flex-1 items-center">
                <View className="flex-row items-center gap-1 mb-0.5">
                  <Clock size={13} color={colors.txMuted} />
                  <AppText variant="caption" color="muted">Duration</AppText>
                </View>
                <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                  {durationMin}
                  <AppText variant="caption" color="muted"> min</AppText>
                </AppText>
              </View>
              <View className="flex-1 items-center border-x border-surface-border">
                <View className="flex-row items-center gap-1 mb-0.5">
                  <Dumbbell size={13} color={colors.txMuted} />
                  <AppText variant="caption" color="muted">Sets</AppText>
                </View>
                <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{totalSets}</AppText>
              </View>
              <View className="flex-1 items-center">
                <View className="flex-row items-center gap-1 mb-0.5">
                  <TrendingUp size={13} color={colors.txMuted} />
                  <AppText variant="caption" color="muted">Volume</AppText>
                </View>
                <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                  {totalVolume > 0 ? totalVolume.toLocaleString() : '—'}
                  {totalVolume > 0 && <AppText variant="caption" color="muted"> {wUnit}</AppText>}
                </AppText>
              </View>
            </View>

            {workout.notes ? (
              <View className="mt-3 pt-3 border-t border-surface-border">
                <AppText variant="body" color="muted">{workout.notes}</AppText>
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
              const maxWeightLbs = sets.length > 0 ? Math.max(...sets.map((s) => s.weight || 0)) : 0
              const maxWeight = displayWeight(maxWeightLbs, wUnit)
              const exVol = displayVolume(sets.reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0), wUnit)

              return (
                <Pressable
                  key={ex.id ?? ex.exercise_id}
                  accessibilityRole="button"
                  onPress={() => router.push(exerciseHref(ex.exercise_id))}
                  // Card surface inlined (not <Card>): its baked-in p-4 can't be
                  // overridden safely (two padding classes = stylesheet-order
                  // roulette) and this card needs edge-to-edge inner sections.
                  className="bg-surface-raised border border-surface-border rounded-2xl overflow-hidden active:scale-[0.99]"
                >
                  <View className="flex-row items-center gap-3 p-4">
                    <ExerciseImage url={ex.exercise?.image_url} />
                    <View className="flex-1">
                      <AppText variant="subheading" numberOfLines={1}>{ex.exercise?.name}</AppText>
                      <View className="flex-row items-center gap-2 mt-0.5">
                        {ex.exercise?.muscle_group ? <MuscleBadge muscle={ex.exercise.muscle_group} /> : null}
                        <AppText variant="caption" color="muted" numberOfLines={1} className="flex-shrink">
                          {sets.length} sets{exVol > 0 ? ` · ${exVol.toLocaleString()} ${wUnit}` : ''}
                        </AppText>
                      </View>
                    </View>
                    {maxWeight > 0 && (
                      <View className="items-end mr-1">
                        <AppText variant="label" color="muted">best</AppText>
                        <AppText variant="subheading" color="brand" style={{ fontVariant: ['tabular-nums'] }}>
                          {maxWeight} {wUnit}
                        </AppText>
                      </View>
                    )}
                    <ChevronRight size={16} color={colors.txMuted} />
                  </View>

                  {sets.length > 0 && (
                    <View className="flex-row items-center gap-2 px-4 pb-4 pt-3 border-t border-surface-border/50">
                      <View className="flex-1 flex-row flex-wrap gap-1.5">
                        {sets.map((set, i) => (
                          <SetChip key={i} set={set} isBest={set.weight === maxWeightLbs && maxWeightLbs > 0} unit={wUnit} />
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

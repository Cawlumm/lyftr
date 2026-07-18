import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router'
import { format } from 'date-fns'
import {
  AlertCircle, ArrowLeft, Award, BookOpen, Check, ChevronDown, ChevronRight, ChevronUp, Dumbbell, Edit2,
  Layers, Pause, Play, TimerOff, TrendingUp, Trash2, X,
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

// Rows shown before the review banner collapses behind a "Show all" toggle (#40).
const SUGGESTION_CAP = 3

function SetChip({ set, isBest, hasSuggestion, unit }: { set: ProgramSet; isBest: boolean; hasSuggestion: boolean; unit: string }) {
  return (
    <View
      className={`px-2.5 py-1.5 rounded-lg border ${
        hasSuggestion ? 'bg-warning-500/10 border-warning-500/40'
          : isBest ? 'bg-brand-500/15 border-brand-500/25' : 'bg-surface-raised border-transparent'
      }`}
    >
      <AppText variant="caption" color={hasSuggestion ? 'secondary' : isBest ? 'brand' : 'secondary'} style={{ fontVariant: ['tabular-nums'] }}>
        {set.target_reps > 0 ? set.target_reps : '—'} ×{' '}
        {set.target_weight > 0 ? `${displayWeight(set.target_weight, unit)} ${unit}` : 'BW'}
      </AppText>
    </View>
  )
}

// One pending auto-progression suggestion (#40), flattened for the review banner.
interface Suggestion {
  setId: number
  exName: string
  setNumber: number
  isPR: boolean
  oldLabel: string
  newLabel: string
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
  const [resolving, setResolving] = useState(false)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Bumped by both the focus refetch and resolveSuggestions. "Last dispatched wins"
  // isn't enough on its own — the GET and the PATCH are independent HTTP requests, so
  // a focus refetch dispatched AFTER an Accept/Dismiss tap can still have its response
  // computed from a server-side read that lands before the PATCH commits, and land
  // either before or after the PATCH's own response. So resolveSuggestions applies its
  // result unconditionally (only one can ever be in flight — the `resolving` guard
  // below blocks a second tap) and bumps the seq again AFTER doing so, invalidating
  // any refetch that was dispatched at any point up to that moment, however its
  // response happens to be ordered.
  const requestSeq = useRef(0)

  // Accept (apply → target) or dismiss staged auto-progression suggestions (#40),
  // then refresh from the returned program.
  const resolveSuggestions = async (accept: number[], dismiss: number[]) => {
    if (!program || resolving) return
    setResolving(true)
    ++requestSeq.current
    try {
      const updated = await client.programAPI.resolveSuggestions(program.id, { accept, dismiss })
      setProgram(updated)
      // Invalidate any focus refetch still in flight from before this point — its
      // response can't be trusted to reflect this write, whichever order it lands in.
      ++requestSeq.current
    } catch {
      // leave the banner in place so the user can retry
    } finally {
      setResolving(false)
    }
  }

  // Refetch on every focus (not just mount) — otherwise a routine reopened from the tab
  // bar shows whatever it looked like when the screen was first pushed, missing targets
  // approved elsewhere or auto-progression suggestions staged by a workout finished since
  // (#40). `loading` only gates the very first render — later refetches update silently
  // so revisiting the screen doesn't flash the full-screen spinner over existing content.
  // A refetch failure only surfaces the full-screen error when nothing has loaded yet —
  // once a program is showing, a transient refocus failure leaves it in place instead of
  // wiping the screen (matches the dashboard's focus-refetch, which doesn't setError at all).
  const loadedRef = useRef(false)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      const load = async () => {
        const seq = ++requestSeq.current
        try {
          const data = await client.programAPI.get(Number(id))
          if (!cancelled && requestSeq.current === seq) { setProgram(data); setError(null); loadedRef.current = true }
        } catch (err) {
          if (!cancelled && !loadedRef.current) setError(apiErrorMessage(err, 'Failed to load program'))
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
      load()
      return () => { cancelled = true }
    }, [id])
  )

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

  // Pending auto-progression suggestions (#40). A suggestion exists when suggested_reps
  // is set. Show the FULL reps×weight on both sides when both changed (a heavier set can
  // also drop the rep target — the user must see that before approving), else the single
  // changed dimension.
  const suggestions: Suggestion[] = exs.flatMap((ex) =>
    (ex.sets ?? [])
      .filter((s) => s.id != null && s.suggested_reps != null)
      .map((s) => {
        const sw = s.suggested_weight as number
        const sr = s.suggested_reps as number
        const weightChanged = s.suggested_weight != null && Math.abs(sw - s.target_weight) > 1e-6
        const repsChanged = sr !== s.target_reps
        const wLabel = (v: number) => (v > 0 ? `${displayWeight(v, wUnit)} ${wUnit}` : 'BW')
        let oldLabel: string, newLabel: string
        if (weightChanged && repsChanged) {
          oldLabel = `${s.target_reps} × ${wLabel(s.target_weight)}`
          newLabel = `${sr} × ${wLabel(sw)}`
        } else if (weightChanged) {
          oldLabel = wLabel(s.target_weight)
          newLabel = wLabel(sw)
        } else {
          oldLabel = `${s.target_reps}`
          newLabel = `${sr} reps`
        }
        return {
          setId: s.id as number,
          exName: ex.exercise?.name ?? 'Exercise',
          setNumber: s.set_number,
          isPR: !!s.suggested_is_pr,
          oldLabel,
          newLabel,
        }
      })
  )
  const suggestedSetIds = suggestions.map((s) => s.setId)
  const warningColor = isDark ? brand.warningSoft : brand.warning

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

          {/* Auto-progression review banner (#40) — approve the targets you beat last workout */}
          {suggestions.length > 0 && (
            <View className="bg-surface-raised border border-warning-500/30 rounded-2xl overflow-hidden">
              <View className="flex-row items-center gap-2 px-4 py-3">
                {suggestions.some((s) => s.isPR)
                  ? <Award size={16} color={warningColor} />
                  : <TrendingUp size={16} color={warningColor} />}
                <AppText variant="bodySemibold" className="flex-1">New targets from your last workout</AppText>
                <View className="bg-warning-500/15 rounded-full px-2 py-0.5">
                  <AppText variant="caption" style={{ color: warningColor, fontWeight: 'bold' }}>{suggestions.length}</AppText>
                </View>
              </View>
              {(showAllSuggestions ? suggestions : suggestions.slice(0, SUGGESTION_CAP)).map((sg) => (
                <View key={sg.setId} className="flex-row items-center gap-3 px-4 py-2.5 border-t border-surface-border/60">
                  <View className="flex-1 flex-row items-center gap-1.5 min-w-0">
                    {sg.isPR ? <Award size={14} color={warningColor} /> : null}
                    <AppText variant="caption" color="secondary" numberOfLines={1} className="flex-1">
                      <AppText variant="caption" color="primary" style={{ fontWeight: '600' }}>{sg.exName}</AppText> · Set {sg.setNumber}
                    </AppText>
                  </View>
                  <View className="flex-row items-center flex-shrink-0">
                    <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'], textDecorationLine: 'line-through' }}>{sg.oldLabel}</AppText>
                    <AppText variant="caption" style={{ color: warningColor, marginHorizontal: 6 }}>→</AppText>
                    <AppText variant="bodySemibold" style={{ fontVariant: ['tabular-nums'] }}>{sg.newLabel}</AppText>
                  </View>
                  <View className="flex-row gap-1.5 flex-shrink-0">
                    <Pressable
                      onPress={() => resolveSuggestions([sg.setId], [])}
                      disabled={resolving}
                      accessibilityLabel={`Accept ${sg.exName} set ${sg.setNumber}`}
                      className={`w-7 h-7 rounded-lg bg-success-500/15 items-center justify-center active:scale-95 ${resolving ? 'opacity-50' : ''}`}
                    >
                      <Check size={14} color={isDark ? brand.successSoft : brand.success} strokeWidth={3} />
                    </Pressable>
                    <Pressable
                      onPress={() => resolveSuggestions([], [sg.setId])}
                      disabled={resolving}
                      accessibilityLabel={`Dismiss ${sg.exName} set ${sg.setNumber}`}
                      className={`w-7 h-7 rounded-lg bg-surface-muted items-center justify-center active:scale-95 ${resolving ? 'opacity-50' : ''}`}
                    >
                      <X size={14} color={colors.txMuted} strokeWidth={3} />
                    </Pressable>
                  </View>
                </View>
              ))}
              {suggestions.length > SUGGESTION_CAP && (
                <Pressable
                  onPress={() => setShowAllSuggestions((v) => !v)}
                  className="flex-row items-center justify-center gap-1.5 py-2 border-t border-surface-border/60 active:opacity-60"
                >
                  <AppText variant="caption" style={{ color: warningColor, fontWeight: '600' }}>
                    {showAllSuggestions ? 'Show less' : `Show all ${suggestions.length}`}
                  </AppText>
                  {showAllSuggestions ? <ChevronUp size={14} color={warningColor} /> : <ChevronDown size={14} color={warningColor} />}
                </Pressable>
              )}
              <View className="flex-row gap-2 px-4 py-3 border-t border-surface-border/60">
                <Pressable
                  onPress={() => resolveSuggestions([], suggestedSetIds)}
                  disabled={resolving}
                  className={`flex-1 py-2 rounded-lg bg-surface-muted border border-surface-border items-center active:scale-95 ${resolving ? 'opacity-50' : ''}`}
                >
                  <AppText variant="bodySemibold" color="secondary">Dismiss all</AppText>
                </Pressable>
                <Pressable
                  onPress={() => resolveSuggestions(suggestedSetIds, [])}
                  disabled={resolving}
                  className={`flex-1 py-2 rounded-lg bg-warning-500 items-center active:scale-95 ${resolving ? 'opacity-50' : ''}`}
                >
                  <AppText variant="bodySemibold" style={{ color: brand.warningText }}>Apply all ({suggestions.length})</AppText>
                </Pressable>
              </View>
            </View>
          )}

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
                          <SetChip key={i} set={set} isBest={set.target_weight === maxTargetLbs && maxTargetLbs > 0} hasSuggestion={set.suggested_reps != null} unit={wUnit} />
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

import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router, type Href } from 'expo-router'
import {
  CheckCircle2, ChevronLeft, ChevronRight, Dumbbell, Flag, Plus, Timer, X,
} from 'lucide-react-native'
import { displayToLbs, displayWeight, weightShort, type Exercise } from '@lyftr/shared'
import { AppText, ConfirmSheet, NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID, Screen } from '../../../src/components/ui'
import { ExerciseImage } from '../../../src/components/workouts/ExerciseImage'
import { ExercisePicker } from '../../../src/components/workouts/ExercisePicker'
import { GymModeWorkout } from '../../../src/components/workouts/GymModeWorkout'
import { client, useSettingsStore, useWorkoutSession } from '../../../src/lib/lyftr'
import { useWorkoutOutcome } from '../../../src/lib/workoutOutcome'
import { useTheme } from '../../../src/theme/useTheme'
import { muscleColor } from '../../../src/utils/exerciseUtils'

// Exercise-detail leaf (workouts/exercise/[exerciseId]) — 1:1 port of web ExerciseDetail.
const exerciseHref = (id: number) => `/workouts/exercise/${id}` as unknown as Href

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const CELL = 'h-11 flex-1 rounded-lg border border-surface-border/60 bg-surface-overlay px-2 text-center font-sans text-base text-tx-primary'

export default function ActiveWorkout() {
  const session = useWorkoutSession((s) => s.session)
  const updateSet = useWorkoutSession((s) => s.updateSet)
  const updateExerciseNotes = useWorkoutSession((s) => s.updateExerciseNotes)
  const completeSet = useWorkoutSession((s) => s.completeSet)
  const addSet = useWorkoutSession((s) => s.addSet)
  const removeSet = useWorkoutSession((s) => s.removeSet)
  const removeExercise = useWorkoutSession((s) => s.removeExercise)
  const addExercise = useWorkoutSession((s) => s.addExercise)
  const buildPayload = useWorkoutSession((s) => s.buildPayload)
  const cancelSession = useWorkoutSession((s) => s.cancelSession)
  const openGym = useWorkoutSession((s) => s.openGym)
  const setOutcome = useWorkoutOutcome((s) => s.setOutcome)

  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const wUnit = weightShort(settings.weight_unit)
  const { colors, accent } = useTheme()

  const [elapsed, setElapsed] = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [showPicker, setShowPicker] = useState(false)

  const scrollRef = useRef<ScrollView>(null)
  const cardY = useRef<number[]>([])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Open gym mode overlay immediately when landing here in gym layout (web parity).
  useEffect(() => {
    if (settings.workout_layout === 'gym' && session) openGym()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!session) return
    const started = new Date(session.started_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session?.started_at])

  const goHome = () => router.replace('/workouts')

  const handleFinish = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const created = await client.workoutAPI.create(buildPayload())
      setOutcome({ kind: 'saved', workoutId: created.id, progression: created.progression })
      cancelSession()
      router.replace('/workouts')
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save workout')
      setSaving(false)
      setConfirmFinish(false)
    }
  }

  const jumpToExercise = useCallback((idx: number) => {
    setActiveExIdx(idx)
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, (cardY.current[idx] ?? 0) - 8), animated: true }))
  }, [])

  const handleCompleteSet = (exIdx: number, setIdx: number) => {
    // Tapping the check means you're done typing this set — drop the keyboard so the row
    // settles and nothing reflows later (e.g. a rest timer starting under a raised board).
    Keyboard.dismiss()
    // Impact only when a set becomes completed (not on un-toggle).
    if (session && !session.exercises[exIdx].sets[setIdx].completed) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    }
    completeSet(exIdx, setIdx)
    if (exIdx !== activeExIdx) setActiveExIdx(exIdx)
  }

  // Mid-session add: web routes to a picker page, but the gym overlay would cover a
  // routed page — so both modes open the ExercisePicker modal (1 blank set, web parity).
  const addExerciseFromPicker = (exercise: Exercise) => {
    addExercise({
      exercise_id: exercise.id,
      exercise,
      notes: '',
      sets: [{ set_number: 1, target_reps: 0, target_weight: 0, actual_reps: 0, actual_weight: 0, completed: false }],
    })
    setShowPicker(false)
  }

  // In gym layout the full-screen gym overlay IS the interface — render it HERE (inside
  // this tab screen), not at the root, so its bottom:0 sits above the tab bar and you can
  // still tap other tabs to leave a running session. When the session ends (session=null
  // on finish/discard) fall back to a neutral surface — never the list-mode UI — so it
  // can't flash through on the gym exit: react-native-screens freezes this screen's
  // snapshot at router.replace() time (before React commits session=null), and a blank
  // one never slides out during the transition.
  if (settings.workout_layout === 'gym') return session ? <GymModeWorkout /> : <View className="flex-1 bg-surface-base" />

  if (!session) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 py-20">
          <View className="h-12 w-12 items-center justify-center rounded-xl border border-surface-border bg-surface-muted">
            <Dumbbell size={24} color={colors.txMuted} />
          </View>
          <AppText variant="bodySemibold">No active workout</AppText>
          <AppText variant="caption" color="muted">Start one from the Workouts tab</AppText>
          <Pressable onPress={goHome} className="mt-2 rounded-xl bg-brand-500 px-4 py-2.5 active:scale-95">
            <AppText variant="bodySemibold" color="white">Go to Workouts</AppText>
          </Pressable>
        </View>
      </Screen>
    )
  }

  const completedSets = session.exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0)
  const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  const allComplete = totalSets > 0 && completedSets === totalSets

  return (
    <Screen>
      {/* Sticky-ish header */}
      <View className="-mx-5 border-b border-surface-border bg-surface-base px-5 pb-2 pt-3">
        <View className="flex-row items-center justify-between gap-3 pb-2.5">
          <View className="min-w-0 flex-1">
            <AppText variant="heading" numberOfLines={1}>{session.name}</AppText>
            <View className="mt-0.5 flex-row items-center gap-3">
              <View className="flex-row items-center gap-1">
                <Timer size={14} color={accent} />
                <Text className="font-sans text-sm" style={{ color: accent, fontVariant: ['tabular-nums'] }}>{formatElapsed(elapsed)}</Text>
              </View>
              <AppText variant="caption" color="muted">{completedSets}/{totalSets} sets done</AppText>
            </View>
          </View>
          <Pressable
            onPress={() => setConfirmFinish(true)}
            className={`flex-row items-center gap-2 rounded-xl px-5 py-2.5 active:scale-95 ${allComplete ? 'bg-brand-500' : 'border border-brand-500/30 bg-brand-500/10'}`}
          >
            <Flag size={16} color={allComplete ? '#ffffff' : accent} />
            <Text className={`font-sans-bold text-sm ${allComplete ? 'text-white' : ''}`} style={allComplete ? undefined : { color: accent }}>Finish</Text>
          </Pressable>
        </View>
        {/* progress bar */}
        <View className="h-0.5 bg-surface-muted">
          <View className="h-full bg-brand-500" style={{ width: `${totalSets > 0 ? (completedSets / totalSets) * 100 : 0}%` }} />
        </View>
        {/* Exercise pills */}
        {session.exercises.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="py-2" contentContainerStyle={{ gap: 6 }}>
            {session.exercises.map((ex, i) => {
              const done = ex.sets.length > 0 && ex.sets.every((s) => s.completed)
              const active = i === activeExIdx
              return (
                <Pressable
                  key={i}
                  onPress={() => jumpToExercise(i)}
                  className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                    done ? 'border-brand-500/30 bg-brand-500/15' : active ? 'border-brand-500/40 bg-brand-500/10' : 'border-surface-border bg-surface-muted'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 size={12} color={accent} />
                  ) : (
                    <View className={`h-3.5 w-3.5 items-center justify-center rounded-full ${active ? 'bg-brand-500' : 'bg-surface-border'}`}>
                      <Text className="text-[9px] font-sans-bold" style={{ color: active ? '#fff' : colors.txMuted }}>{i + 1}</Text>
                    </View>
                  )}
                  <AppText variant="caption" color={done || active ? 'brand' : 'muted'} numberOfLines={1} className="max-w-[88px]">{ex.exercise.name}</AppText>
                </Pressable>
              )
            })}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 12, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {saveError ? (
          <View className="rounded-xl border border-error-500/20 bg-error-500/10 p-4">
            <AppText variant="body" color="error">{saveError}</AppText>
          </View>
        ) : null}

        {session.exercises.length === 0 ? (
          <View className="items-center gap-1 py-16">
            <Dumbbell size={28} color={colors.txMuted} />
            <AppText variant="bodySemibold" className="mt-2">No exercises yet</AppText>
            <AppText variant="caption" color="muted">Add exercises below</AppText>
          </View>
        ) : (
          session.exercises.map((ex, exIdx) => {
            const allSetsComplete = ex.sets.length > 0 && ex.sets.every((s) => s.completed)
            const isActive = exIdx === activeExIdx
            const completedHere = ex.sets.filter((s) => s.completed).length
            const tint = muscleColor(ex.exercise.muscle_group)
            return (
              <View
                key={exIdx}
                onLayout={(e: LayoutChangeEvent) => { cardY.current[exIdx] = e.nativeEvent.layout.y }}
                className={`overflow-hidden rounded-2xl border ${allSetsComplete ? 'border-brand-500/30 bg-brand-500/5' : isActive ? 'border-brand-500/40 bg-surface-base' : 'border-surface-border bg-surface-base'}`}
              >
                {/* Header */}
                <View className="flex-row items-center gap-3 px-4 pb-3 pt-4">
                  <ExerciseImage url={ex.exercise.image_url} />
                  <Pressable className="min-w-0 flex-1" onPress={() => router.push(exerciseHref(ex.exercise_id))}>
                    <AppText variant="bodySemibold" numberOfLines={1}>{ex.exercise.name}</AppText>
                    <View className="mt-1 flex-row items-center gap-2">
                      <View className={`rounded px-1.5 py-0.5 ${tint?.chip ?? 'bg-surface-muted'}`}>
                        <AppText variant="caption" style={{ color: tint?.text ?? colors.txMuted }}>{ex.exercise.muscle_group}</AppText>
                      </View>
                      <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'] }}>{completedHere}/{ex.sets.length} sets</AppText>
                    </View>
                  </Pressable>
                  {allSetsComplete ? (
                    <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-500">
                      <CheckCircle2 size={18} color="#ffffff" />
                    </View>
                  ) : (
                    <Pressable onPress={() => removeExercise(exIdx)} hitSlop={6} accessibilityLabel="Remove exercise" className="h-9 w-9 items-center justify-center rounded-xl active:bg-error-500/10">
                      <X size={16} color={colors.txMuted} />
                    </Pressable>
                  )}
                </View>

                {/* Notes */}
                <View className="px-4 pb-2">
                  <TextInput
                    defaultValue={ex.notes}
                    onEndEditing={(e) => updateExerciseNotes(exIdx, e.nativeEvent.text)}
                    placeholder="+ Add note…"
                    placeholderTextColor={colors.txMuted}
                    className="font-sans text-xs text-tx-secondary"
                    accessibilityLabel={`Notes, ${ex.exercise.name}`}
                  />
                </View>

                {/* Sets */}
                <View className="gap-2 px-3 pb-3">
                  <View className="flex-row items-center gap-2 px-1">
                    <View className="w-8 items-center"><AppText variant="caption" color="muted">Set</AppText></View>
                    <View className="flex-1 items-center"><AppText variant="caption" color="muted">Reps</AppText></View>
                    <View className="flex-1 items-center"><AppText variant="caption" color="muted">Weight ({wUnit})</AppText></View>
                    <View className="w-12 items-center"><AppText variant="caption" color="muted">Done</AppText></View>
                    <View className="w-7" />
                  </View>
                  {ex.sets.map((set, setIdx) => {
                    const isNextSet = isActive && !set.completed && ex.sets.slice(0, setIdx).every((s) => s.completed)
                    return (
                      <View
                        key={setIdx}
                        className={`flex-row items-center gap-2 rounded-xl border ${set.completed ? 'border-brand-500/20 bg-brand-500/10' : isNextSet ? 'border-brand-500/35 bg-surface-muted/50' : 'border-surface-border/60 bg-surface-muted/30'}`}
                      >
                        <View className="w-8 items-center py-3">
                          <Text className="font-sans-bold text-sm" style={{ color: set.completed ? accent : colors.txMuted, fontVariant: ['tabular-nums'] }}>{set.set_number}</Text>
                        </View>
                        <View className="flex-1">
                          <TextInput
                            editable={!set.completed}
                            value={set.actual_reps ? String(set.actual_reps) : ''}
                            onChangeText={(t) => updateSet(exIdx, setIdx, 'actual_reps', Number(t.replace(/[^0-9]/g, '')) || 0)}
                            keyboardType="number-pad"
                            inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                            placeholder={set.target_reps > 0 ? String(set.target_reps) : '—'}
                            placeholderTextColor={colors.txMuted}
                            className={`${CELL} ${set.completed ? 'opacity-40' : ''}`}
                            style={{ fontVariant: ['tabular-nums'] }}
                            accessibilityLabel={`Reps, set ${set.set_number}, ${ex.exercise.name}`}
                          />
                        </View>
                        <View className="flex-1">
                          <TextInput
                            editable={!set.completed}
                            value={set.actual_weight ? String(displayWeight(set.actual_weight, wUnit)) : ''}
                            onChangeText={(t) => {
                              let v = t.replace(/[^0-9.]/g, '')
                              const i = v.indexOf('.')
                              if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
                              updateSet(exIdx, setIdx, 'actual_weight', displayToLbs(Number(v) || 0, settings.weight_unit))
                            }}
                            keyboardType="decimal-pad"
                            inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                            placeholder={set.target_weight > 0 ? String(displayWeight(set.target_weight, wUnit)) : '—'}
                            placeholderTextColor={colors.txMuted}
                            className={`${CELL} ${set.completed ? 'opacity-40' : ''}`}
                            style={{ fontVariant: ['tabular-nums'] }}
                            accessibilityLabel={`Weight, set ${set.set_number}, ${ex.exercise.name}`}
                          />
                        </View>
                        <Pressable
                          onPress={() => handleCompleteSet(exIdx, setIdx)}
                          className={`h-11 w-12 items-center justify-center ${set.completed ? 'bg-brand-500' : isNextSet ? 'bg-brand-500/20' : ''}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${set.completed ? 'Completed' : 'Complete'} set ${set.set_number}, ${ex.exercise.name}`}
                        >
                          <CheckCircle2 size={24} color={set.completed ? '#ffffff' : isNextSet ? accent : colors.txMuted} />
                        </Pressable>
                        <Pressable onPress={() => removeSet(exIdx, setIdx)} hitSlop={6} accessibilityLabel="Remove set" className="w-7 items-center justify-center">
                          <X size={14} color={colors.txMuted} />
                        </Pressable>
                      </View>
                    )
                  })}

                  {/* Add Set / Prev / Next / Finish */}
                  <View className="mt-1 flex-row gap-2">
                    {isActive && exIdx > 0 ? (
                      <Pressable onPress={() => jumpToExercise(exIdx - 1)} accessibilityLabel="Previous exercise" className="items-center justify-center rounded-xl border border-surface-border bg-surface-muted px-3 py-2.5 active:scale-95">
                        <ChevronLeft size={16} color={colors.txSecondary} />
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => addSet(exIdx)} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-border py-2.5 active:opacity-60">
                      <Plus size={14} color={colors.txMuted} />
                      <Text className="font-sans-semibold text-xs text-tx-muted">Add Set</Text>
                    </Pressable>
                    {isActive && exIdx < session.exercises.length - 1 ? (
                      <Pressable onPress={() => jumpToExercise(exIdx + 1)} className={`flex-row items-center justify-center gap-1 rounded-xl px-3 py-2.5 active:scale-95 ${allSetsComplete ? 'bg-brand-500' : 'border border-surface-border bg-surface-muted'}`}>
                        <Text className={`font-sans-semibold text-xs ${allSetsComplete ? 'text-white' : 'text-tx-secondary'}`}>Next</Text>
                        <ChevronRight size={14} color={allSetsComplete ? '#ffffff' : colors.txSecondary} />
                      </Pressable>
                    ) : null}
                    {isActive && exIdx === session.exercises.length - 1 ? (
                      <Pressable onPress={() => setConfirmFinish(true)} className={`flex-row items-center justify-center gap-1 rounded-xl px-3 py-2.5 active:scale-95 ${allSetsComplete ? 'bg-brand-500' : 'border border-surface-border bg-surface-muted'}`}>
                        <Flag size={14} color={allSetsComplete ? '#ffffff' : colors.txSecondary} />
                        <Text className={`font-sans-semibold text-xs ${allSetsComplete ? 'text-white' : 'text-tx-secondary'}`}>Finish</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            )
          })
        )}

        {/* Footer */}
        <View className="mt-2 gap-2">
          <Pressable onPress={() => setShowPicker(true)} className="flex-row items-center justify-center gap-2 rounded-2xl border border-surface-border bg-surface-muted py-3.5 active:scale-95">
            <Plus size={16} color={colors.txSecondary} />
            <Text className="font-sans-semibold text-sm text-tx-secondary">Add Exercise</Text>
          </Pressable>
          <Pressable onPress={() => setConfirmCancel(true)} className="items-center py-2.5 active:opacity-60">
            <Text className="font-sans text-xs text-tx-muted">Cancel Workout</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Finish confirm */}
      <ConfirmSheet
        open={confirmFinish}
        icon={Flag}
        title="Finish Workout?"
        message={`${completedSets} of ${totalSets} sets completed. Workout will be saved.`}
        confirmLabel="Finish"
        busyLabel="Saving…"
        cancelLabel="Keep Going"
        busy={saving}
        onConfirm={handleFinish}
        onCancel={() => setConfirmFinish(false)}
      />

      {/* Cancel confirm */}
      <ConfirmSheet
        open={confirmCancel}
        icon={X}
        destructive
        title="Cancel Workout?"
        message="All progress will be lost."
        confirmLabel="Cancel Workout"
        cancelLabel="Keep Going"
        onConfirm={() => { setOutcome({ kind: 'discarded', session }); cancelSession(); router.replace('/workouts') }}
        onCancel={() => setConfirmCancel(false)}
      />

      {showPicker ? (
        <ExercisePicker
          selectedIds={session.exercises.map((e) => e.exercise_id)}
          onSelect={addExerciseFromPicker}
          onClose={() => setShowPicker(false)}
        />
      ) : null}

      {/* iOS Done bar above the numeric keyboard (reps/weight fields reference it). */}
      <NumericKeyboardAccessory />
    </Screen>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Image, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeOut } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { router, usePathname } from 'expo-router'
import {
  Check, CheckCircle2, ChevronLeft, ChevronRight, Dumbbell, Flag, Layers, Minimize2,
  Play, Plus, Repeat, Timer, Trash2, X,
} from 'lucide-react-native'
import {
  displayToLbs, displayWeight, weightShort, type Exercise,
} from '@lyftr/shared'
import { AppText, ConfirmSheet, NumberField, NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID, StepperTile } from '../ui'
import { RestPicker } from './RestPicker'
import { ExercisePicker } from './ExercisePicker'
import { MuscleDiagram } from './MuscleDiagram'
import { RestTimerBanner } from './RestTimerBanner'
import { client, useSettingsStore, useWorkoutSession } from '../../lib/lyftr'
import { useWorkoutOutcome } from '../../lib/workoutOutcome'
import { useTheme } from '../../theme/useTheme'
import { clampStep, clampValue } from '../../utils/number'
import { nextIncompleteSet } from '../../utils/workoutSets'
import { muscleColor, EQUIPMENT_LABEL } from '../../utils/exerciseUtils'

// Port of web/pages/GymModeWorkout.tsx — full-screen 3-phase FSM overlay
// (overview → exercise-info → exercise). Mounted at the ROOT layout when a session
// exists, the layout pref is 'gym', and gymOpen is true (mirrors web's Layout).
function MuscleBadge({ muscle, small }: { muscle: string; small?: boolean }) {
  const { colors } = useTheme()
  const tint = muscleColor(muscle)
  return (
    <View className={`rounded ${small ? 'px-1.5 py-0.5' : 'px-2 py-0.5'} ${tint?.chip ?? 'bg-surface-muted'} ${tint?.border ? `border ${tint.border}` : ''}`}>
      <AppText variant="caption" style={{ color: tint?.text ?? colors.txMuted }}>{muscle}</AppText>
    </View>
  )
}

function ExerciseNotes({ exIdx, notes, onSave }: { exIdx: number; notes: string; onSave: (i: number, v: string) => void }) {
  const { colors } = useTheme()
  return (
    <TextInput
      defaultValue={notes}
      onEndEditing={(e) => onSave(exIdx, e.nativeEvent.text)}
      placeholder="+ Add note…"
      placeholderTextColor={colors.txMuted}
      className="font-sans text-xs text-tx-secondary"
    />
  )
}

export function GymModeWorkout() {
  const session = useWorkoutSession((s) => s.session)
  const minimizeGym = useWorkoutSession((s) => s.minimizeGym)
  const phase = useWorkoutSession((s) => s.gymPhase)
  const activeIdx = useWorkoutSession((s) => s.gymExIdx)
  const activeSetIdx = useWorkoutSession((s) => s.gymSetIdx)
  const setGymState = useWorkoutSession((s) => s.setGymState)
  const updateSet = useWorkoutSession((s) => s.updateSet)
  const completeSet = useWorkoutSession((s) => s.completeSet)
  const addSet = useWorkoutSession((s) => s.addSet)
  const removeSet = useWorkoutSession((s) => s.removeSet)
  const removeExercise = useWorkoutSession((s) => s.removeExercise)
  const addExercise = useWorkoutSession((s) => s.addExercise)
  const updateExerciseNotes = useWorkoutSession((s) => s.updateExerciseNotes)
  const buildPayload = useWorkoutSession((s) => s.buildPayload)
  const cancelSession = useWorkoutSession((s) => s.cancelSession)
  const setOutcome = useWorkoutOutcome((s) => s.setOutcome)
  const startRest = useWorkoutSession((s) => s.startRest)
  const clearRest = useWorkoutSession((s) => s.clearRest)
  const restExIdx = useWorkoutSession((s) => s.restExIdx)
  const restSetIdx = useWorkoutSession((s) => s.restSetIdx)
  // Subscribe to the DERIVED boolean, not the raw rest stamps. Pause/resume/adjust flip
  // restEndsAt ↔ restPausedRemainingMs but keep "a rest sheet is showing" true the whole
  // time — selecting the boolean means those transitions don't re-render this whole
  // overlay (which would re-run the muscle diagram and flash). Only start (false→true)
  // and skip/clear (true→false) re-render, which is correct.
  const restShown = useWorkoutSession((s) => s.restEndsAt != null || s.restPausedRemainingMs != null)
  const setExerciseRest = useWorkoutSession((s) => s.setExerciseRest)

  const settings = useSettingsStore((s) => s.settings)
  const wUnit = weightShort(settings.weight_unit)
  const { colors, accent } = useTheme()
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const [imgFailed, setImgFailed] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  const setPhase = (p: typeof phase) => setGymState(p, activeIdx, activeSetIdx)
  const onSetActiveIdx = (i: number) => setGymState(phase, i, 0)
  const setActiveSetIdx = (i: number) => setGymState(phase, activeIdx, i)

  useEffect(() => { setImgFailed(false) }, [activeIdx])

  // Jump to a newly added exercise
  const prevLenRef = useRef(session?.exercises.length ?? 0)
  useEffect(() => {
    const len = session?.exercises.length ?? 0
    if (len > prevLenRef.current) onSetActiveIdx(len - 1)
    prevLenRef.current = len
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.exercises.length])

  // Clamp a stale activeIdx that points past the list (e.g. after removing the last
  // exercise) HERE in an effect — never during render. Correcting store state inside the
  // render body throws "state update in render" and can spin a reload loop.
  useEffect(() => {
    const len = session?.exercises.length ?? 0
    if (len > 0 && activeIdx >= len) setGymState(phase, len - 1, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, session?.exercises.length])

  if (!session) return null

  const totalSets = session.exercises.reduce((s, ex) => s + ex.sets.length, 0)
  const completedSets = session.exercises.reduce((s, ex) => s + ex.sets.filter((st) => st.completed).length, 0)
  const allDone = completedSets === totalSets && totalSets > 0

  const handleFinish = async () => {
    setSaving(true)
    try {
      const created = await client.workoutAPI.create(buildPayload())
      setOutcome({ kind: 'saved', workoutId: created.id, progression: created.progression })
      cancelSession()
      minimizeGym()
      router.replace('/workouts')
    } catch {
      setSaving(false)
      setConfirmFinish(false)
    }
  }

  const handleMinimize = () => {
    minimizeGym()
    // Web navigates away from /workout/active so the list UI doesn't show underneath.
    if (pathname === '/workouts/active') router.replace('/workouts')
  }

  const addExerciseFromPicker = (exercise: Exercise) => {
    addExercise({
      exercise_id: exercise.id,
      exercise,
      notes: '',
      sets: [{ set_number: 1, target_reps: 0, target_weight: 0, actual_reps: 0, actual_weight: 0, completed: false }],
    })
    setShowPicker(false)
  }

  // Render FUNCTIONS, not nested components. A component defined inside the render body
  // gets a fresh function identity every render, so React unmounts+remounts its whole
  // subtree each time (reloading images + the muscle diagram). Called as plain functions,
  // their returned elements reconcile by real type (SafeAreaView/View) — no remount.
  const overlay = (children: React.ReactNode) => (
    // Soft dissolve on exit (finish / discard / minimize) instead of a hard cut — the
    // overlay fades as the navigation settles underneath. Exit-only; entering is the
    // route push.
    <Animated.View exiting={FadeOut.duration(160)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }}>
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }} className="bg-surface-base">
      {children}
      <ConfirmSheet
        open={confirmFinish}
        icon={Flag}
        title="Finish Workout?"
        message={`${completedSets} of ${totalSets} sets completed. Workout will be saved.`}
        confirmLabel="Finish" busyLabel="Saving…" cancelLabel="Keep Going" busy={saving}
        onConfirm={handleFinish} onCancel={() => setConfirmFinish(false)}
      />
      <ConfirmSheet
        open={confirmCancel}
        icon={Trash2} destructive
        title="Discard workout?"
        message="This ends the workout without saving — all progress is lost."
        confirmLabel="Discard" cancelLabel="Keep Going"
        onConfirm={() => { setOutcome({ kind: 'discarded', session }); cancelSession(); handleMinimize() }}
        onCancel={() => setConfirmCancel(false)}
      />
      {showPicker ? (
        <ExercisePicker
          selectedIds={session.exercises.map((e) => e.exercise_id)}
          onSelect={addExerciseFromPicker}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
      {/* Floating rest banner on the non-logging phases (the logging phase docks its
          own). Mirrors web Layout's `gymOpen && gymPhase !== 'exercise'` render. */}
      {phase !== 'exercise' ? <RestTimerBanner /> : null}
      {/* iOS Done bar above the numeric keyboard (the reps/weight NumberFields link it). */}
      <NumericKeyboardAccessory />
    </SafeAreaView>
    </Animated.View>
  )

  const topBar = (onBack: () => void) => (
    <View className="flex-shrink-0 flex-row items-center gap-3 border-b border-surface-border px-4 pb-3 pt-2">
      <Pressable onPress={onBack} hitSlop={6} className="rounded-xl p-2 active:bg-surface-muted">
        <ChevronLeft size={20} color={colors.txMuted} />
      </Pressable>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
          {session.exercises.map((_, i) => {
            const done = session.exercises[i].sets.every((st) => st.completed) && session.exercises[i].sets.length > 0
            return (
              <Pressable
                key={i}
                onPress={() => setGymState('exercise-info', i, 0)}
                accessibilityLabel={`Go to exercise ${i + 1}`}
                className={`h-1.5 rounded-full ${i === activeIdx ? 'w-6 bg-brand-500' : done ? 'w-2 bg-brand-500/40' : 'w-2 bg-surface-border'}`}
              />
            )
          })}
        </ScrollView>
        <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'] }}>{activeIdx + 1}/{session.exercises.length}</AppText>
      </View>
      <View className="flex-shrink-0 flex-row items-center gap-1">
        <Pressable onPress={() => setConfirmFinish(true)} className={`flex-row items-center gap-1.5 rounded-xl px-3 py-2 ${allDone ? 'bg-brand-500' : 'border border-surface-border bg-surface-muted'}`}>
          <Flag size={14} color={allDone ? '#ffffff' : colors.txMuted} />
          <Text className={`font-sans-semibold text-xs ${allDone ? 'text-white' : 'text-tx-muted'}`}>Finish</Text>
        </Pressable>
        <Pressable onPress={handleMinimize} hitSlop={6} accessibilityLabel="Minimize workout" className="rounded-xl p-2 active:bg-surface-muted">
          <Minimize2 size={16} color={colors.txMuted} />
        </Pressable>
        <Pressable onPress={() => setConfirmCancel(true)} hitSlop={6} accessibilityLabel="Discard workout" className="rounded-xl p-2 active:bg-error-500/10">
          <X size={20} color={colors.txMuted} />
        </Pressable>
      </View>
    </View>
  )

  // ── Overview ──────────────────────────────────────────────
  if (phase === 'overview') {
    const muscles = [...new Set(session.exercises.map((e) => e.exercise.muscle_group))].length
    return overlay(
      <>
        <View className="flex-row items-center justify-between border-b border-surface-border px-5 pb-4 pt-2">
          <View className="flex-1">
            <AppText variant="label" color="muted" className="uppercase">Workout</AppText>
            <AppText variant="heading" numberOfLines={1}>{session.name}</AppText>
          </View>
          <View className="flex-row items-center gap-1">
            <Pressable onPress={handleMinimize} hitSlop={6} accessibilityLabel="Minimize" className="rounded-xl p-2 active:bg-surface-muted">
              <Minimize2 size={16} color={colors.txMuted} />
            </Pressable>
            <Pressable onPress={() => setConfirmCancel(true)} hitSlop={6} accessibilityLabel="Discard workout" className="rounded-xl p-2 active:bg-error-500/10">
              <X size={20} color={colors.txMuted} />
            </Pressable>
          </View>
        </View>

        <View className="flex-row border-b border-surface-border px-5 py-4">
          {[
            { v: session.exercises.length, l: 'Exercises' },
            { v: totalSets, l: 'Total Sets' },
            { v: muscles, l: 'Muscles' },
          ].map((s) => (
            <View key={s.l} className="flex-1 items-center">
              <Text className="font-display text-xl text-tx-primary" style={{ fontVariant: ['tabular-nums'] }}>{s.v}</Text>
              <AppText variant="label" color="muted" className="mt-0.5 uppercase">{s.l}</AppText>
            </View>
          ))}
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 8 }}>
          {session.exercises.length === 0 ? (
            <View className="items-center gap-3 py-16">
              <Dumbbell size={40} color={colors.txMuted} />
              <AppText variant="body" color="muted">No exercises added yet</AppText>
            </View>
          ) : (
            session.exercises.map((ex, i) => {
              const done = ex.sets.length > 0 && ex.sets.every((s) => s.completed)
              return (
                <View key={i} className={`flex-row items-center gap-3 rounded-2xl border p-3 ${done ? 'border-brand-500/30 bg-brand-500/5' : 'border-surface-border bg-surface-base'}`}>
                  <View className="h-8 w-8 items-center justify-center rounded-full border border-surface-border bg-surface-muted">
                    <Text className="font-sans-bold text-sm" style={{ color: done ? accent : colors.txMuted }}>{i + 1}</Text>
                  </View>
                  {ex.exercise.image_url ? (
                    <Image source={{ uri: ex.exercise.image_url }} className="h-10 w-10 rounded-xl bg-surface-muted" />
                  ) : (
                    <View className="h-10 w-10 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
                      <Dumbbell size={16} color={accent} />
                    </View>
                  )}
                  <View className="flex-1">
                    <AppText variant="bodySemibold" numberOfLines={1}>{ex.exercise.name}</AppText>
                    <View className="mt-0.5 flex-row items-center gap-2">
                      <MuscleBadge muscle={ex.exercise.muscle_group} small />
                      <AppText variant="caption" color="muted">{ex.sets.length} sets</AppText>
                    </View>
                  </View>
                  {done ? <CheckCircle2 size={16} color={accent} /> : null}
                </View>
              )
            })
          )}
        </ScrollView>

        <View className="gap-2 border-t border-surface-border px-5 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={() => setShowPicker(true)} className="flex-row items-center justify-center gap-2 rounded-2xl border border-surface-border bg-surface-muted py-3 active:scale-95">
            <Plus size={16} color={colors.txSecondary} />
            <Text className="font-sans-semibold text-sm text-tx-secondary">Add Exercise</Text>
          </Pressable>
          {session.exercises.length > 0 ? (
            <Pressable onPress={() => setGymState('exercise-info', 0, 0)} className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-500 py-4 active:scale-95">
              <Play size={20} color="#ffffff" />
              <Text className="font-sans-bold text-base text-white">Start Workout</Text>
            </Pressable>
          ) : null}
        </View>
      </>,
    )
  }

  // A stale/out-of-range index just renders nothing for one frame; the clamp effect
  // above fixes activeIdx (no store writes during render).
  const ex = session.exercises[activeIdx]
  if (!ex) return null
  const isFirst = activeIdx === 0
  const isLast = activeIdx === session.exercises.length - 1

  // ── Exercise info ─────────────────────────────────────────
  if (phase === 'exercise-info') {
    const exercise = ex.exercise
    const equipLabel = EQUIPMENT_LABEL[exercise.equipment?.toLowerCase()] || exercise.equipment
    const descLines = exercise.description ? exercise.description.split('\n').filter((l) => l.trim()) : []
    const repsVals = ex.sets.map((s) => s.target_reps).filter((r) => r > 0)
    const wtVals = ex.sets.map((s) => displayWeight(s.target_weight, wUnit)).filter((w) => w > 0)
    const range = (a: number[]) => (a.length === 0 ? '—' : Math.min(...a) === Math.max(...a) ? String(Math.min(...a)) : `${Math.min(...a)}–${Math.max(...a)}`)
    const planStats = [
      { icon: Layers, label: 'Sets', value: String(ex.sets.length) },
      { icon: Repeat, label: 'Reps', value: range(repsVals) },
      { icon: Dumbbell, label: 'Weight', value: `${range(wtVals)} ${wUnit}` },
    ]
    return overlay(
      <>
        {topBar(() => (isFirst ? setPhase('overview') : setGymState('exercise', activeIdx - 1, 0)))}
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 20 }}>
          {exercise.image_url && !imgFailed ? (
            <Image source={{ uri: exercise.image_url }} onError={() => setImgFailed(true)} className="h-52 w-full bg-surface-muted" resizeMode="cover" />
          ) : null}
          <View className="gap-5 px-5 pb-4 pt-5">
            <View>
              <AppText variant="title">{exercise.name}</AppText>
              <View className="mt-2 flex-row flex-wrap items-center gap-2">
                <MuscleBadge muscle={exercise.muscle_group} />
                {equipLabel && exercise.equipment !== 'other' ? (
                  <View className="rounded-full border border-surface-border bg-surface-muted px-3 py-1"><AppText variant="caption" color="secondary">{equipLabel}</AppText></View>
                ) : null}
                {exercise.category ? (
                  <View className="rounded-full border border-surface-border bg-surface-muted px-3 py-1"><AppText variant="caption" color="secondary" className="capitalize">{exercise.category}</AppText></View>
                ) : null}
              </View>
            </View>

            {/* Plan */}
            <View className="flex-row rounded-2xl border border-surface-border bg-surface-raised p-4">
              {planStats.map(({ icon: Ico, label, value }, i) => (
                <View key={label} className={`flex-1 items-center gap-1.5 ${i > 0 ? 'border-l border-surface-border' : ''}`}>
                  <Ico size={16} color={accent} />
                  <Text className="font-display text-xl text-tx-primary" style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
                  <AppText variant="label" color="muted" className="uppercase">{label}</AppText>
                </View>
              ))}
            </View>

            {/* Rest */}
            <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <View className="flex-row items-center gap-2">
                <Timer size={16} color={accent} />
                <AppText variant="label" color="muted" className="uppercase">Rest between sets</AppText>
              </View>
              <AppText variant="caption" color="muted" className="mb-3 mt-1">Auto-starts when you complete a set</AppText>
              <View className="mt-3">
                <RestPicker value={ex.rest_seconds ?? (settings.rest_seconds_default ?? 90)} onChange={(secs) => setExerciseRest(activeIdx, secs)} />
              </View>
            </View>

            {exercise.secondary_muscles?.length > 0 ? (
              <View>
                <AppText variant="label" color="muted" className="mb-2 uppercase">Also works</AppText>
                <View className="flex-row flex-wrap gap-1.5">
                  {exercise.secondary_muscles.map((m) => <MuscleBadge key={m} muscle={m} small />)}
                </View>
              </View>
            ) : null}

            {/* Muscle diagram */}
            <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <AppText variant="label" color="muted" className="mb-3 uppercase">Muscles Worked</AppText>
              <MuscleDiagram exercise={exercise} />
            </View>

            {descLines.length > 0 ? (
              <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
                <AppText variant="label" color="muted" className="mb-3 uppercase">Instructions</AppText>
                <View className="gap-2.5">
                  {descLines.map((line, i) => {
                    const m = line.match(/^(\d+\.)\s*(.*)/)
                    return (
                      <AppText key={i} variant="body" color="secondary">
                        {m ? <AppText variant="bodySemibold">{m[1]} </AppText> : null}{m ? m[2] : line}
                      </AppText>
                    )
                  })}
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View className="border-t border-surface-border px-5 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={() => setPhase('exercise')} className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-500 py-4 active:scale-95">
            <Play size={20} color="#ffffff" />
            <Text className="font-sans-bold text-base text-white">Begin Exercise</Text>
          </Pressable>
        </View>
      </>,
    )
  }

  // ── Exercise sets ─────────────────────────────────────────
  const allSetsComplete = ex.sets.length > 0 && ex.sets.every((s) => s.completed)
  const completedHere = ex.sets.filter((s) => s.completed).length
  const clampedSetIdx = Math.min(activeSetIdx, ex.sets.length - 1)
  const set = ex.sets[clampedSetIdx]

  const handleCompleteSetGym = (setIdx: number) => {
    // Done typing this set — drop the keyboard so the rest sheet doesn't animate in under
    // a raised keyboard (and pausing it later can't trigger a blur-reflow).
    Keyboard.dismiss()
    const wasCompleted = ex.sets[setIdx].completed
    completeSet(activeIdx, setIdx)
    if (wasCompleted) {
      if (restExIdx === activeIdx && restSetIdx === setIdx) clearRest()
      return
    }
    // Satisfying "clunk" when a set lands (native-feel; web has none).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    if (settings.rest_enabled) {
      const r = ex.rest_seconds ?? settings.rest_seconds_default ?? 90
      if (r > 0) startRest(r, activeIdx, setIdx)
    }
    const next = nextIncompleteSet(ex.sets, setIdx)
    if (next !== -1) setActiveSetIdx(next)
  }

  const handleRemoveSet = (setIdx: number) => {
    removeSet(activeIdx, setIdx)
    setActiveSetIdx(Math.max(0, Math.min(setIdx, ex.sets.length - 2)))
  }

  const handleRemoveExercise = () => {
    removeExercise(activeIdx)
    const newLen = session.exercises.length - 1
    if (newLen === 0) { setPhase('overview'); return }
    onSetActiveIdx(Math.min(activeIdx, newLen - 1))
  }

  if (!set) return null

  const restingHere = restExIdx === activeIdx
  const restNextSet = restingHere && restSetIdx != null ? nextIncompleteSet(ex.sets, restSetIdx) : -1
  const hideCompleteForRest = restingHere && clampedSetIdx === restNextSet

  return overlay(
    <>
      {topBar(() => setPhase('exercise-info'))}
      {/* name + muscle */}
      <View className="flex-shrink-0 border-b border-surface-border px-5 pb-3 pt-4">
        <View className="flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1">
            <AppText variant="heading" numberOfLines={1}>{ex.exercise.name}</AppText>
            <View className="mt-1 flex-row items-center gap-2">
              <MuscleBadge muscle={ex.exercise.muscle_group} small />
              <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'] }}>{completedHere}/{ex.sets.length} sets done</AppText>
            </View>
          </View>
          {!allSetsComplete ? (
            <Pressable onPress={handleRemoveExercise} hitSlop={6} accessibilityLabel="Remove this exercise" className="rounded-lg p-1.5 active:bg-error-500/10">
              <Trash2 size={16} color={colors.txMuted} />
            </Pressable>
          ) : null}
        </View>
        <View className="mt-2">
          <ExerciseNotes exIdx={activeIdx} notes={ex.notes} onSave={updateExerciseNotes} />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View className={`m-auto w-full items-center px-5 ${restingHere ? 'gap-4 py-2' : 'gap-6 py-4'}`}>
          {/* set selector chips */}
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            {ex.sets.map((s, i) => {
              const resting = restingHere && restSetIdx === i
              return (
                <Pressable
                  key={i}
                  onPress={() => setActiveSetIdx(i)}
                  accessibilityLabel={`Set ${i + 1}${s.completed ? ', done' : ''}${resting ? ', resting' : ''}`}
                  className={`h-10 min-w-[44px] flex-row items-center justify-center gap-1 rounded-full px-3 active:scale-95 ${
                    i === clampedSetIdx ? 'bg-brand-500' : s.completed ? `bg-brand-500/15 ${resting ? 'border border-brand-500/60' : ''}` : 'bg-surface-muted'
                  }`}
                >
                  {s.completed ? <Check size={14} color={i === clampedSetIdx ? '#ffffff' : accent} /> : null}
                  <Text className="font-sans-bold text-sm" style={{ color: i === clampedSetIdx ? '#ffffff' : s.completed ? accent : colors.txMuted, fontVariant: ['tabular-nums'] }}>{i + 1}</Text>
                </Pressable>
              )
            })}
          </View>

          {/* target reference */}
          {set.target_reps > 0 || set.target_weight > 0 ? (
            <AppText variant="body" color="muted" className="text-center">
              Target <Text className="font-sans-semibold" style={{ color: colors.txSecondary, fontVariant: ['tabular-nums'] }}>{set.target_reps > 0 ? set.target_reps : '—'} reps</Text>
              {set.target_weight > 0 ? <Text> · <Text className="font-sans-semibold" style={{ color: colors.txSecondary, fontVariant: ['tabular-nums'] }}>{displayWeight(set.target_weight, wUnit)} {wUnit}</Text></Text> : null}
            </AppText>
          ) : null}

          {/* reps + weight steppers */}
          <View className="w-full flex-row gap-3">
            <View className="flex-1">
              <StepperTile icon={Repeat} label="Reps" name="reps" step={1} disabled={set.completed} onStep={(d) => updateSet(activeIdx, clampedSetIdx, 'actual_reps', clampStep(set.actual_reps || 0, d, { min: 0 }))}>
                <NumberField key={`reps-${activeIdx}-${clampedSetIdx}`} inputMode="numeric" value={set.actual_reps ? String(set.actual_reps) : ''} onChange={(v) => updateSet(activeIdx, clampedSetIdx, 'actual_reps', Math.round(clampValue(v)))} placeholder={set.target_reps > 0 ? String(set.target_reps) : '0'} disabled={set.completed} accessibilityLabel="Reps" inputAccessoryViewID={NUMERIC_ACCESSORY_ID} />
              </StepperTile>
            </View>
            <View className="flex-1">
              <StepperTile icon={Dumbbell} label={`Weight (${wUnit})`} name="weight" step={2.5} disabled={set.completed} onStep={(d) => updateSet(activeIdx, clampedSetIdx, 'actual_weight', displayToLbs(clampStep(displayWeight(set.actual_weight, wUnit), d, { min: 0 }), settings.weight_unit))}>
                <NumberField key={`wt-${activeIdx}-${clampedSetIdx}`} inputMode="decimal" value={set.actual_weight ? String(displayWeight(set.actual_weight, wUnit)) : ''} onChange={(v) => updateSet(activeIdx, clampedSetIdx, 'actual_weight', displayToLbs(clampValue(v), settings.weight_unit))} placeholder={set.target_weight > 0 ? String(displayWeight(set.target_weight, wUnit)) : '0'} disabled={set.completed} accessibilityLabel="Weight" inputAccessoryViewID={NUMERIC_ACCESSORY_ID} />
              </StepperTile>
            </View>
          </View>

          {/* complete + remove (hidden while resting before this set) */}
          {!hideCompleteForRest ? (
            <View className="w-full items-center gap-6">
              <Pressable onPress={() => handleCompleteSetGym(clampedSetIdx)} className={`w-full flex-row items-center justify-center gap-3 rounded-2xl py-5 active:scale-95 ${set.completed ? 'border-2 border-brand-500/40 bg-brand-500/15' : 'bg-brand-500'}`}>
                <CheckCircle2 size={24} color={set.completed ? accent : '#ffffff'} />
                <Text className={`font-sans-bold text-base ${set.completed ? '' : 'text-white'}`} style={set.completed ? { color: accent } : undefined}>{set.completed ? 'Completed' : 'Complete Set'}</Text>
              </Pressable>
              {ex.sets.length > 1 ? (
                <Pressable onPress={() => handleRemoveSet(clampedSetIdx)} className="active:opacity-60">
                  <Text className="font-sans text-xs text-tx-muted">Remove this set</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* bottom nav — when a rest sheet is docked below it, that sheet owns the safe-area
          bottom (they sit flush); otherwise the nav reserves the home-indicator inset. */}
      <View className="flex-shrink-0 gap-2 border-t border-surface-border px-5 pt-3" style={{ paddingBottom: restShown ? 12 : insets.bottom + 12 }}>
        <View className="flex-row gap-2">
          {/* active:scale-95 stays in the class list unconditionally (disabled blocks the
              press anyway). Toggling a pseudo-class (active:) on/off across renders makes
              NativeWind re-evaluate the View→Pressable upgrade after the initial render,
              which fires a dev-only printUpgradeWarning whose JSON.stringify walks into
              react-navigation's default context getter and throws. Keeping active: stable
              avoids the churn entirely. */}
          <Pressable onPress={() => setActiveSetIdx(clampedSetIdx - 1)} disabled={clampedSetIdx === 0} className={`rounded-xl border border-surface-border bg-surface-muted p-3 active:scale-95 ${clampedSetIdx === 0 ? 'opacity-30' : ''}`}>
            <ChevronLeft size={16} color={colors.txSecondary} />
          </Pressable>
          <Pressable onPress={() => { addSet(activeIdx); setActiveSetIdx(ex.sets.length) }} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-border py-3 active:opacity-60">
            <Plus size={14} color={colors.txMuted} />
            <Text className="font-sans-semibold text-xs text-tx-muted">Add Set</Text>
          </Pressable>
          <Pressable onPress={() => setActiveSetIdx(clampedSetIdx + 1)} disabled={clampedSetIdx >= ex.sets.length - 1} className={`rounded-xl border border-surface-border bg-surface-muted p-3 active:scale-95 ${clampedSetIdx >= ex.sets.length - 1 ? 'opacity-30' : ''}`}>
            <ChevronRight size={16} color={colors.txSecondary} />
          </Pressable>
        </View>
        <View className="flex-row gap-2">
          <Pressable onPress={() => setPhase('exercise-info')} className="flex-row items-center gap-1.5 rounded-xl border border-surface-border bg-surface-muted px-4 py-3 active:scale-95">
            <ChevronLeft size={16} color={colors.txSecondary} />
            <Text className="font-sans-semibold text-sm text-tx-secondary">Info</Text>
          </Pressable>
          {isLast ? (
            <Pressable onPress={() => setConfirmFinish(true)} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 active:scale-95 ${allSetsComplete ? 'bg-brand-500' : 'border border-brand-500/30 bg-brand-500/10'}`}>
              <Flag size={16} color={allSetsComplete ? '#ffffff' : accent} />
              <Text className={`font-sans-bold text-sm ${allSetsComplete ? 'text-white' : ''}`} style={allSetsComplete ? undefined : { color: accent }}>Finish Workout</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setGymState('exercise-info', activeIdx + 1, 0)} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 active:scale-95 ${allSetsComplete ? 'bg-brand-500' : 'border border-surface-border bg-surface-muted'}`}>
              <Text className={`font-sans-bold text-sm ${allSetsComplete ? 'text-white' : 'text-tx-secondary'}`}>Next Exercise</Text>
              <ChevronRight size={16} color={allSetsComplete ? '#ffffff' : colors.txSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* docked rest banner */}
      <RestTimerBanner docked />
    </>,
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { CheckCircle2, Dumbbell, Flag, Plus, Timer, X } from '../../../src/components/ui/icons'
import { useAsyncAction, weightShort, type Exercise, formatElapsed, occurrenceKeys, remapIndex, useElapsedSeconds, useTranslation } from '@lyftr/shared'
import { AppText, ConfirmSheet, NumericKeyboardAccessory, Screen, scrollBleed } from '../../../src/components/ui'
import { WEB_BUTTON, currentStep, interactive } from '../../../src/components/ui/interaction'
import { ActiveExerciseCard } from '../../../src/components/workouts/ActiveExerciseCard'
import { ExercisePicker } from '../../../src/components/workouts/ExercisePicker'
import { GymModeWorkout } from '../../../src/components/workouts/GymModeWorkout'
import { ReorderButton, ReorderExercisesSheet } from '../../../src/components/workouts/ReorderExercisesSheet'
import { useStableCallback } from '../../../src/hooks/useStableCallback'
import { client, useSettingsStore, useWorkoutSession } from '../../../src/lib/lyftr'
import { useWorkoutOutcome } from '../../../src/lib/workoutOutcome'
import { useTheme } from '../../../src/theme/useTheme'

// The list's top padding and the gap between cards; jumpToExercise adds up positions with it.
const CARD_GAP = 12

export default function ActiveWorkout() {
  const { t } = useTranslation()
  const session = useWorkoutSession((s) => s.session)
  const updateSet = useWorkoutSession((s) => s.updateSet)
  const updateExerciseNotes = useWorkoutSession((s) => s.updateExerciseNotes)
  const completeSet = useWorkoutSession((s) => s.completeSet)
  const addSet = useWorkoutSession((s) => s.addSet)
  const removeSet = useWorkoutSession((s) => s.removeSet)
  const removeExercise = useWorkoutSession((s) => s.removeExercise)
  const addExercise = useWorkoutSession((s) => s.addExercise)
  const moveExercise = useWorkoutSession((s) => s.moveExercise)
  const buildPayload = useWorkoutSession((s) => s.buildPayload)
  const cancelSession = useWorkoutSession((s) => s.cancelSession)
  const openGym = useWorkoutSession((s) => s.openGym)
  const setOutcome = useWorkoutOutcome((s) => s.setOutcome)

  const settings = useSettingsStore((s) => s.settings)
  const fetchSettings = useSettingsStore((s) => s.fetch)
  const wUnit = weightShort(settings.weight_unit)
  const { colors, accent } = useTheme()

  const elapsed = useElapsedSeconds(session?.started_at)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [showPicker, setShowPicker] = useState(false)
  const [showReorder, setShowReorder] = useState(false)

  const scrollRef = useRef<ScrollViewInstance>(null)
  // Heights by exercise rather than y by slot: react-native-web reports onLayout only when a
  // view resizes (ResizeObserver), so a card that merely changes place after a reorder never
  // re-reports its y. Summing the heights in the current order stays right on both.
  const cardH = useRef(new Map<string, number>())
  const keysRef = useRef<string[]>([])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Open gym mode overlay immediately when landing here in gym layout (web parity).
  useEffect(() => {
    if (settings.workout_layout === 'gym' && session) openGym()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goHome = () => router.replace('/workouts')

  // The sheet stays OPEN when this fails. The session is intact and the server may
  // be reachable again in a moment, so the retry belongs under the finger that just
  // tapped Finish - the alternative, dismissing to a banner at the top of a scrolled
  // list, is what #145 felt like from the user's seat.
  const finish = useAsyncAction(async () => {
    const created = await client.workoutAPI.create(buildPayload())
    setOutcome({ kind: 'saved', workoutId: created.id, progression: created.progression })
    cancelSession()
    router.replace('/workouts')
  }, t('workouts.active.saveFailed'))

  const jumpToExercise = useCallback((idx: number) => {
    setActiveExIdx(idx)
    let y = CARD_GAP
    for (let j = 0; j < idx; j++) y += (cardH.current.get(keysRef.current[j]) ?? 0) + CARD_GAP
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }))
  }, [])

  const handleCardLayout = useStableCallback((idx: number, height: number) => {
    const key = keysRef.current[idx]
    if (key) cardH.current.set(key, height)
  })

  const requestFinish = useCallback(() => setConfirmFinish(true), [])
  const openReorder = useCallback(() => setShowReorder(true), [])

  // The highlighted exercise follows the one it was on, not the slot.
  const handleMove = useCallback((from: number, to: number) => {
    moveExercise(from, to)
    setActiveExIdx((a) => remapIndex(a, from, to))
  }, [moveExercise])

  // useStableCallback (not plain closure): this is passed to the memoized
  // ActiveExerciseCard for every exercise, so it must keep a permanently stable
  // identity — the per-second `elapsed` tick re-renders this screen every second,
  // and a fresh closure here (it reads `session`/`activeExIdx`) would invalidate
  // every card's memo on every tick, not just the touched one.
  const handleCompleteSet = useStableCallback((exIdx: number, setIdx: number) => {
    // Tapping the check means you're done typing this set — drop the keyboard so the row
    // settles and nothing reflows later (e.g. a rest timer starting under a raised board).
    Keyboard.dismiss()
    // Impact only when a set becomes completed (not on un-toggle).
    if (session && !session.exercises[exIdx].sets[setIdx].completed) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    }
    completeSet(exIdx, setIdx)
    if (exIdx !== activeExIdx) setActiveExIdx(exIdx)
  })

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
      <Screen maxWidth="medium">
        <View className="flex-1 items-center justify-center gap-3 py-20">
          <View className="h-12 w-12 items-center justify-center rounded-xl border border-surface-border bg-surface-muted">
            <Dumbbell size={24} color={colors.txMuted} />
          </View>
          <AppText variant="bodySemibold">{t('workouts.active.noWorkout.title')}</AppText>
          <AppText variant="caption" color="muted">{t('workouts.active.noWorkout.hintTab')}</AppText>
          <Pressable onPress={goHome} accessibilityRole={WEB_BUTTON} className={`mt-2 rounded-xl bg-brand-500 px-4 py-2.5 active:scale-95 ${interactive('hover:bg-brand-600')}`}>
            <AppText variant="bodySemibold" color="white">{t('workouts.active.noWorkout.goWorkouts')}</AppText>
          </Pressable>
        </View>
      </Screen>
    )
  }

  const completedSets = session.exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0)
  const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  const allComplete = totalSets > 0 && completedSets === totalSets
  const rowKeys = occurrenceKeys(session.exercises.map((e) => e.exercise_id))
  keysRef.current = rowKeys

  return (
    <Screen maxWidth="medium">
      {/* Sticky-ish header */}
      <View className="-mx-5 border-b border-surface-border bg-surface-base px-5 pb-2 pt-3">
        <View className="flex-row items-center justify-between gap-3 pb-2.5">
          <View className="min-w-0 flex-1">
            <AppText variant="heading" headingLevel={1} numberOfLines={1}>{session.name}</AppText>
            <View className="mt-0.5 flex-row items-center gap-3">
              <View className="flex-row items-center gap-1">
                <Timer size={14} color={accent} />
                <Text className="font-sans text-sm" style={{ color: accent, fontVariant: ['tabular-nums'] }}>{formatElapsed(elapsed)}</Text>
              </View>
              <AppText variant="caption" color="muted">{t('workouts.active.setsDone', { done: completedSets, count: totalSets })}</AppText>
            </View>
          </View>
          <Pressable
            onPress={() => setConfirmFinish(true)}
            accessibilityRole={WEB_BUTTON}
            className={`flex-row items-center gap-2 rounded-xl px-5 py-2.5 active:scale-95 ${allComplete ? 'bg-brand-500' : 'border border-brand-500/30 bg-brand-500/10'} ${interactive(allComplete ? 'hover:bg-brand-600' : 'hover:bg-brand-500/20')}`}
          >
            <Flag size={16} color={allComplete ? '#ffffff' : accent} />
            <Text className={`font-sans-bold text-sm ${allComplete ? 'text-white' : ''}`} style={allComplete ? undefined : { color: accent }}>{t('workouts.active.finish')}</Text>
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
                  key={rowKeys[i]}
                  onPress={() => jumpToExercise(i)}
                  accessibilityRole={WEB_BUTTON}
                  {...currentStep(active)}
                  className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                    done ? 'border-brand-500/30 bg-brand-500/15' : active ? 'border-brand-500/40 bg-brand-500/10' : 'border-surface-border bg-surface-muted'
                  } ${interactive('hover:border-brand-500/40')}`}
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
        style={scrollBleed} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: CARD_GAP, gap: CARD_GAP }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {session.exercises.length === 0 ? (
          <View className="items-center gap-1 py-16">
            <Dumbbell size={28} color={colors.txMuted} />
            <AppText variant="bodySemibold" className="mt-2">{t('workouts.active.empty.title')}</AppText>
            <AppText variant="caption" color="muted">{t('workouts.active.empty.hint')}</AppText>
          </View>
        ) : (
          session.exercises.map((ex, exIdx) => (
            <ActiveExerciseCard
              key={rowKeys[exIdx]}
              index={exIdx}
              ex={ex}
              isActive={exIdx === activeExIdx}
              isLast={exIdx === session.exercises.length - 1}
              wUnit={wUnit}
              weightUnit={settings.weight_unit}
              onCardLayout={handleCardLayout}
              onRemoveExercise={removeExercise}
              onNotesChange={updateExerciseNotes}
              onAddSet={addSet}
              onRemoveSet={removeSet}
              onUpdateSet={updateSet}
              onCompleteSet={handleCompleteSet}
              onJumpToExercise={jumpToExercise}
              onRequestFinish={requestFinish}
            />
          ))
        )}

        {/* Footer */}
        <View className="mt-2 gap-2">
          <View className="flex-row gap-2">
            <Pressable onPress={() => setShowPicker(true)} accessibilityRole={WEB_BUTTON} className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-surface-border bg-surface-muted py-3.5 active:scale-95 ${interactive('hover:bg-surface-border')}`}>
              <Plus size={16} color={colors.txSecondary} />
              <Text className="font-sans-semibold text-sm text-tx-secondary">{t('workouts.active.addExercise')}</Text>
            </Pressable>
            {session.exercises.length > 1 ? <ReorderButton onPress={openReorder} size="footer" /> : null}
          </View>
          <Pressable onPress={() => setConfirmCancel(true)} accessibilityRole={WEB_BUTTON} className={`items-center py-2.5 active:opacity-60 ${interactive('rounded-lg hover:bg-surface-muted')}`}>
            <Text className="font-sans text-xs text-tx-muted">{t('workouts.active.cancelWorkout')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Finish confirm */}
      <ConfirmSheet
        open={confirmFinish}
        icon={Flag}
        title={t('workouts.active.finishConfirm.title')}
        message={t('workouts.active.finishConfirm.message', { done: completedSets, count: totalSets })}
        confirmLabel={t('workouts.active.finish')}
        busyLabel={t('common.saving')}
        cancelLabel={t('workouts.active.keepGoing')}
        busy={finish.busy}
        error={finish.error}
        onConfirm={() => { void finish.run() }}
        onCancel={() => { setConfirmFinish(false); finish.reset() }}
      />

      {/* Cancel confirm */}
      <ConfirmSheet
        open={confirmCancel}
        icon={X}
        destructive
        title={t('workouts.active.cancelConfirm.title')}
        message={t('workouts.active.cancelConfirm.message')}
        confirmLabel={t('common.cancel')}
        cancelLabel={t('workouts.active.keepGoing')}
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

      <ReorderExercisesSheet
        open={showReorder}
        names={session.exercises.map((e) => e.exercise.name)}
        rowKeys={rowKeys}
        onMove={handleMove}
        onClose={() => setShowReorder(false)}
      />

      {/* iOS Done bar above the numeric keyboard (reps/weight fields reference it). */}
      <NumericKeyboardAccessory />
    </Screen>
  )
}

import { useEffect, useRef, useState, type Ref } from 'react'
import { AccessibilityInfo, Image, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View, type PressableInstance } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { router, usePathname } from 'expo-router'
import {
  ArrowRight, ArrowUpDown, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Dumbbell, Ellipsis, Flag, Layers,
  LayoutList, Link2, List, Play, Plus, Repeat, Timer, Trash2, Unlink2,
} from '../ui/icons'
import {
  useAsyncAction, displayToLbs, type ActiveSessionExercise, displayWeight, exerciseFractions, occurrenceKeys, weightShort, useTranslation, type Exercise,
  currentRound, groupColorIndex, pairWith, remapIndex, restLabel, roundRecap, roundRest, totalRounds,
} from '@lyftr/shared'
import { SHEET_ANIM_MS } from '../ui/Sheet'
import { AppText, ConfirmSheet, Menu, NumberField, NumericKeyboardAccessory, NUMERIC_ACCESSORY_ID, StepperTile, type MenuItem } from '../ui'
import { RestPicker } from './RestPicker'
import { ExercisePicker } from './ExercisePicker'
import { GymExercisesSheet, type ExercisesSheetMode } from './GymExercisesSheet'
import { ElapsedClock, ProgressSegments } from './GymProgress'
import { MuscleDiagram } from './MuscleDiagram'
import { RestTimerBanner } from './RestTimerBanner'
import { applyRestOnToggle } from '../../lib/restOnSetToggle'
import { GymFrame } from './GymFrame'
import { WEB_BUTTON, interactive } from '../ui/interaction'
import { swallowEscapeKeyup } from '../ui/overlay'
import { client, useSettingsStore, useWorkoutSession } from '../../lib/lyftr'
import { finishConfirmCopy } from '../../lib/finishConfirm'
import { useWorkoutOutcome } from '../../lib/workoutOutcome'
import { useTheme } from '../../theme/useTheme'
import {
  PLATE_STEP, REP_STEP, clampStep, clampValue, groupOf, nextIncompleteSet, nextSupersetTarget, numericRange,
} from '@lyftr/shared'
import { muscleLabel, equipmentLabel, categoryLabel } from '../../utils/exerciseUtils'
import { MuscleBadge } from './MuscleBadge'
import { SupersetMarker } from './SupersetMarker'
import { ExerciseThumb, SupersetSheet, useGroupColors } from './superset'

const supersetInfo = (rows: { superset_group?: number | null }[], i: number) => {
  const g = groupOf(rows, i)
  return g ? { letter: g.letter, position: i - g.start + 1, total: g.end - g.start + 1 } : undefined
}

const web = Platform.OS === 'web'

// react-native-web never fires onEndEditing, so on web the note saves on blur (Enter blurs a
// single-line field). Escape puts back what was saved, as the Vite page did, and is kept from
// the dialog, which would otherwise minimize on the same key.
const webNotes = (exIdx: number, notes: string, onSave: (i: number, v: string) => void) => ({
  onBlur: (e: { nativeEvent: { text: string } }) => onSave(exIdx, e.nativeEvent.text),
  onKeyPress: (e: { nativeEvent: { key: string }; target: unknown }) => {
    if (e.nativeEvent.key !== 'Escape') return
    swallowEscapeKeyup()
    const input = e.target as { value: string; blur: () => void }
    input.value = notes
    input.blur()
  },
}) as object

// Port of web/pages/GymModeWorkout.tsx — full-screen 3-phase FSM overlay
// (overview → exercise-info → exercise). Mounted at the ROOT layout when a session
// exists, the layout pref is 'gym', and gymOpen is true (mirrors web's Layout).
function ExerciseNotes({ exIdx, notes, onSave }: { exIdx: number; notes: string; onSave: (i: number, v: string) => void }) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  return (
    <TextInput
      defaultValue={notes}
      onEndEditing={(e) => onSave(exIdx, e.nativeEvent.text)}
      {...(web ? webNotes(exIdx, notes, onSave) : {})}
      placeholder={t('workouts.active.notes.placeholderMobile')}
      placeholderTextColor={colors.txMuted}
      className="min-h-6 font-sans text-xs text-tx-secondary"
    />
  )
}

const exerciseTag = (rows: { superset_group?: number | null }[], i: number) => {
  const g = groupOf(rows, i)
  return g ? `${g.letter}${i - g.start + 1}` : undefined
}

// Weight is shown only when there is one: a bodyweight set reads as its reps.
function useEffort(unit: string) {
  const { t } = useTranslation()
  return (weightLbs: number, reps: number) => weightLbs > 0
    ? t('gym.superset.effort', { weight: `${displayWeight(weightLbs, unit)} ${unit}`, reps })
    : t('common.count.reps', { count: reps })
}

function SupersetPill({ letter, round, total, colorIndex }: { letter: string; round: number; total: number; colorIndex: number }) {
  const { t } = useTranslation()
  const c = useGroupColors(colorIndex)
  return (
    <View testID="gym-superset-pill" className="h-9 flex-row items-center gap-2 self-center rounded-full px-3.5" style={{ backgroundColor: c.tint, borderWidth: 1, borderColor: c.border }}>
      <Repeat size={16} color={c.ink} />
      <Text className="font-sans-bold text-[13px]" style={{ color: c.ink }}>{t('gym.superset.pill', { letter, n: Math.min(round + 1, total), total })}</Text>
    </View>
  )
}

function ThenCard({ text, rests, colorIndex }: { text: string; rests: boolean; colorIndex: number }) {
  const { t } = useTranslation()
  const c = useGroupColors(colorIndex)
  const Ico = rests ? Timer : ArrowRight
  return (
    <View testID="gym-superset-then" className="w-full flex-row items-center gap-3 rounded-2xl border border-dashed bg-surface-raised px-3 py-2.5" style={{ borderColor: c.border }}>
      <View className="h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: c.tint }}>
        <Ico size={20} color={c.ink} />
      </View>
      <View className="min-w-0 flex-1">
        <AppText variant="label" className="uppercase" style={{ color: c.ink }}>{t('gym.superset.then')}</AppText>
        <AppText variant="bodySemibold">{text}</AppText>
      </View>
    </View>
  )
}

function NextToast({ text }: { text: string }) {
  const { colors } = useTheme()
  return (
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 16, right: 16, bottom: 148, alignItems: 'center' }}>
      <View testID="gym-superset-toast" className="max-w-full flex-row items-center gap-2 rounded-full border border-surface-border bg-surface-raised px-4 py-2.5 shadow-lg">
        <ArrowRight size={16} color={colors.txSecondary} />
        <AppText variant="bodySemibold" numberOfLines={1} className="flex-shrink">{text}</AppText>
      </View>
    </View>
  )
}

// What replaces the set body while the rest after a superset round runs: the round's result and
// the step that follows. The countdown and its chip are the docked RestTimerBanner's.
function RoundComplete({ rows, restExIdx, restSetIdx, wUnit }: { rows: ActiveSessionExercise[]; restExIdx: number; restSetIdx: number; wUnit: string }) {
  const { t } = useTranslation()
  const { colors, brand } = useTheme()
  const effortText = useEffort(wUnit)
  const g = groupOf(rows, restExIdx)
  const c = useGroupColors(groupColorIndex(rows, restExIdx))
  if (!g) return null
  const recap = roundRecap(
    rows.map((r) => ({ sets: (r.sets ?? []).map((s) => ({ completed: s.completed, weight: s.actual_weight, reps: s.actual_reps })) })),
    g, restSetIdx,
  )
  const target = nextSupersetTarget(rows, restExIdx, restSetIdx)
  const final = target ? target.setIdx === totalRounds(rows, g.start, g.end) - 1 : false
  const after = target ? nextSupersetTarget(rows, target.exIdx, target.setIdx) : null
  const targetSet = target ? rows[target.exIdx]?.sets[target.setIdx] : undefined
  const w = targetSet ? targetSet.actual_weight || targetSet.target_weight || 0 : 0
  const r = targetSet ? targetSet.actual_reps || targetSet.target_reps || 0 : 0
  const effort = w > 0 || r > 0 ? effortText(w, r) : ''
  const thenName = after && target && after.exIdx !== target.exIdx ? rows[after.exIdx].exercise.name : ''
  return (
    <View testID="gym-round-complete" className="w-full gap-4">
      <View role="group" accessibilityLabel={t('gym.superset.thisRound')} className="gap-2.5 rounded-2xl border border-surface-border bg-surface-raised px-4 py-3">
        <AppText variant="label" color="muted" className="uppercase">{t('gym.superset.thisRound')}</AppText>
        {recap.map((e) => (
          <View key={e.exIdx} className="min-h-7 flex-row items-center gap-2.5">
            <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: e.completed ? brand.success : colors.muted }}>
              {e.completed ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
            </View>
            <AppText variant="bodySemibold" numberOfLines={1} className="min-w-0 flex-1">{rows[e.exIdx].exercise.name}</AppText>
            <AppText variant="bodySemibold" style={{ fontVariant: ['tabular-nums'] }}>{effortText(e.weight ?? 0, e.reps ?? 0)}</AppText>
          </View>
        ))}
      </View>
      {target ? (
        <View role="group" accessibilityLabel={t(final ? 'gym.superset.upNextFinal' : 'gym.superset.upNext')} className="flex-row items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: c.tint, borderWidth: 1.5, borderColor: c.border }}>
          <ExerciseThumb url={rows[target.exIdx].exercise.image_url} tag={exerciseTag(rows, target.exIdx)} colorIndex={groupColorIndex(rows, restExIdx)} />
          <View className="min-w-0 flex-1">
            <AppText variant="label" className="uppercase" style={{ color: c.ink }}>{t(final ? 'gym.superset.upNextFinal' : 'gym.superset.upNext')}</AppText>
            <AppText variant="bodySemibold" numberOfLines={1}>{t('gym.superset.upNextTitle', { name: rows[target.exIdx].exercise.name, number: target.setIdx + 1 })}</AppText>
            {effort || thenName ? (
              <AppText variant="caption" color="secondary">
                {thenName ? t('gym.superset.upNextThen', { detail: effort, name: thenName }) : effort}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}

// The exercise's name is the way to the others: the whole block (name, ▾, position and meta)
// opens the exercises sheet, so the name is shown once and is never cut to fit a chip.
function ExerciseSwitcher({ name, current, total, title, details, superset, onPress, children, ref }: {
  name: string
  /** 1-based position of this exercise. */
  current: number
  total: number
  /** The info phase's larger title rather than the set screen's heading. */
  title?: boolean
  /** What the meta row says, for the accessible name: a button's name replaces its content. */
  details: string[]
  /** Set when the exercise is in a superset: read out in the accessible name; the pill shows it. */
  superset?: { letter: string; position: number; total: number }
  onPress: () => void
  children: React.ReactNode
  ref?: Ref<PressableInstance>
}) {
  const { t } = useTranslation()
  const { colors, accent } = useTheme()
  return (
    <Pressable
      ref={ref}
      testID="gym-exercise-switcher"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[t('gym.exercises.switcher', { current, total, name }), ...(superset ? [t('workouts.superset.position', superset)] : []), ...details].join(', ')}
      className={`min-w-0 flex-shrink rounded-xl px-2 py-1.5 active:bg-surface-muted ${interactive('hover:bg-surface-muted')}`}
    >
      <View className="flex-row items-center gap-2">
        <AppText variant={title ? 'title' : 'heading'} numberOfLines={1} className="min-w-0 flex-shrink">{name}</AppText>
        <View className="h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-surface-border bg-surface-muted">
          <ChevronDown size={14} color={colors.txMuted} />
        </View>
      </View>
      <View className={`${title ? 'mt-2' : 'mt-1'} flex-row flex-wrap items-center gap-2`}>
        <Text className="font-sans-bold text-xs" style={{ color: accent, fontVariant: ['tabular-nums'] }}>{`${current}/${total}`}</Text>
        {children}
      </View>
    </Pressable>
  )
}

export function GymModeWorkout() {
  // Also re-renders on a language switch for the labels read from the catalog.
  const { t } = useTranslation()
  const session = useWorkoutSession((s) => s.session)
  const minimizeGym = useWorkoutSession((s) => s.minimizeGym)
  const phase = useWorkoutSession((s) => s.gymPhase)
  const activeIdx = useWorkoutSession((s) => s.gymExIdx)
  const activeSetIdx = useWorkoutSession((s) => s.gymSetIdx)
  const setGymState = useWorkoutSession((s) => s.setGymState)
  const updateSet = useWorkoutSession((s) => s.updateSet)
  const addSet = useWorkoutSession((s) => s.addSet)
  const removeSet = useWorkoutSession((s) => s.removeSet)
  const removeExercise = useWorkoutSession((s) => s.removeExercise)
  const addExercise = useWorkoutSession((s) => s.addExercise)
  const moveExercise = useWorkoutSession((s) => s.moveExercise)
  const unlinkFromNext = useWorkoutSession((s) => s.unlinkFromNext)
  const updateExerciseNotes = useWorkoutSession((s) => s.updateExerciseNotes)
  const buildPayload = useWorkoutSession((s) => s.buildPayload)
  const cancelSession = useWorkoutSession((s) => s.cancelSession)
  const setOutcome = useWorkoutOutcome((s) => s.setOutcome)
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
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [exercisesSheet, setExercisesSheet] = useState<ExercisesSheetMode | null>(null)
  // Spoken on native by announceForAccessibility; on web this text sits in a live region.
  const [announcement, setAnnouncement] = useState('')
  const [toast, setToast] = useState('')
  const [supersetOpen, setSupersetOpen] = useState(false)
  // On web, a jump or a phase change unmounts the control focus would go back to, so focus is
  // put on its counterpart in the new phase instead of falling to the page.
  const switcherRef = useRef<PressableInstance>(null)
  const minimizeRef = useRef<PressableInstance>(null)
  const pendingFocus = useRef<typeof switcherRef | null>(null)

  const setPhase = (p: typeof phase) => setGymState(p, activeIdx, activeSetIdx)
  const onSetActiveIdx = (i: number) => setGymState(phase, i, 0)
  const setActiveSetIdx = (i: number) => setGymState(phase, activeIdx, i)
  // A jump lands on the exercise's first set still to do, not on set 1 when that is logged.
  // In a superset it lands on the group's first step still to do, which can be another member.
  const openExercise = (i: number) => {
    const rows = session?.exercises ?? []
    const to = groupOf(rows, i) ? nextSupersetTarget(rows, i, -1) : null
    if (to) setGymState('exercise-info', to.exIdx, to.setIdx)
    else setGymState('exercise-info', i, Math.max(0, nextIncompleteSet(rows[i]?.sets ?? [], -1)))
  }
  const announce = (message: string) => {
    setAnnouncement(message)
    AccessibilityInfo.announceForAccessibility(message)
  }

  useEffect(() => { setImgFailed(false) }, [activeIdx])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const target = pendingFocus.current
    if (!web || !target || exercisesSheet) return
    pendingFocus.current = null
    // The switcher's comes after the sheet has finished closing, so the sheet's own focus
    // restore cannot undo it.
    setTimeout(() => target.current?.focus(), target === switcherRef ? SHEET_ANIM_MS + 50 : 0)
  }, [phase, activeIdx, exercisesSheet])

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

  // The sheet stays OPEN when this fails. The session is intact and the server may
  // be reachable again in a moment, so the retry belongs under the finger that just
  // tapped Finish - the alternative, dismissing to a banner at the top of a scrolled
  // list, is what #145 felt like from the user's seat.
  const finish = useAsyncAction(async () => {
    const created = await client.workoutAPI.create(buildPayload())
    setOutcome({ kind: 'saved', workoutId: created.id, progression: created.progression })
    cancelSession()
    minimizeGym()
    router.replace('/workouts')
  }, t('workouts.active.saveFailed'))

  if (!session) return null

  const totalSets = session.exercises.reduce((s, ex) => s + ex.sets.length, 0)
  const completedSets = session.exercises.reduce((s, ex) => s + ex.sets.filter((st) => st.completed).length, 0)
  const allDone = completedSets === totalSets && totalSets > 0
  const finishCopy = finishConfirmCopy(t, completedSets, totalSets)


  const handleMinimize = () => {
    minimizeGym()
    // Web navigates away from /workout/active so the list UI doesn't show underneath.
    if (pathname === '/workouts/active') router.replace('/workouts')
  }

  const handleRemoveExercise = () => {
    removeExercise(activeIdx)
    const newLen = session.exercises.length - 1
    if (newLen === 0) { setPhase('overview'); return }
    onSetActiveIdx(Math.min(activeIdx, newLen - 1))
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
    <GymFrame onClose={handleMinimize}>
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }} className="bg-surface-base">
      {children}
      {web && announcement ? (
        <Text role="status" aria-live="polite" testID="gym-announcement" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}>{announcement}</Text>
      ) : null}
      {/* Docked in-flow below every phase's bottom actions so it never covers them; owns
          the bottom safe-area inset while shown. */}
      <RestTimerBanner />
      <ConfirmSheet
        open={confirmFinish}
        icon={finishCopy.nothingToSave ? Trash2 : Flag}
        destructive={finishCopy.nothingToSave}
        title={finishCopy.title}
        message={finishCopy.message}
        confirmLabel={finishCopy.confirmLabel} busyLabel={t('common.saving')} cancelLabel={t('workouts.active.keepGoing')} busy={finish.busy}
        error={finish.error}
        onConfirm={() => {
          if (finishCopy.nothingToSave) { setOutcome({ kind: 'discarded', session }); cancelSession(); handleMinimize() } else void finish.run()
        }} onCancel={() => { setConfirmFinish(false); finish.reset() }}
      />
      <ConfirmSheet
        open={confirmCancel}
        icon={Trash2} destructive
        title={t('gym.discard.title')}
        message={t('gym.discard.message')}
        confirmLabel={t('gym.discard.confirm')} cancelLabel={t('workouts.active.keepGoing')}
        onConfirm={() => { setOutcome({ kind: 'discarded', session }); cancelSession(); handleMinimize() }}
        onCancel={() => setConfirmCancel(false)}
      />
      <ConfirmSheet
        open={confirmRemove}
        icon={Trash2} destructive
        title={t('gym.removeConfirm.title')}
        message={t('gym.removeConfirm.message', { name: session.exercises[activeIdx]?.exercise.name ?? '', count: session.exercises[activeIdx]?.sets.filter((st) => st.completed).length ?? 0 })}
        confirmLabel={t('gym.removeConfirm.confirm')} cancelLabel={t('workouts.active.keepGoing')}
        onConfirm={() => { setConfirmRemove(false); handleRemoveExercise() }}
        onCancel={() => setConfirmRemove(false)}
      />
      {showPicker ? (
        <ExercisePicker
          selectedIds={session.exercises.map((e) => e.exercise_id)}
          onSelect={addExerciseFromPicker}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
      <GymExercisesSheet
        open={exercisesSheet}
        exercises={session.exercises.map((e, i) => ({
          name: e.exercise.name, done: e.sets.filter((st) => st.completed).length, total: e.sets.length,
          superset: supersetInfo(session.exercises, i),
          imageUrl: e.exercise.image_url, colorIndex: groupColorIndex(session.exercises, i),
        }))}
        rowKeys={occurrenceKeys(session.exercises.map((e) => e.exercise_id))}
        current={activeIdx}
        onJump={(i) => { pendingFocus.current = switcherRef; setExercisesSheet(null); if (i !== activeIdx) openExercise(i) }}
        onMove={moveExercise}
        onClose={() => setExercisesSheet(null)}
      />
      <SupersetSheet
        visible={supersetOpen}
        currentName={session.exercises[activeIdx]?.exercise.name ?? ''}
        currentIndex={activeIdx}
        candidates={pairCandidates}
        restLabel={restLabel(session.exercises[activeIdx]?.rest_seconds ?? settings.rest_seconds_default ?? 90)}
        onCreate={pairExercise}
        onClose={() => setSupersetOpen(false)}
      />
      {/* iOS Done bar above the numeric keyboard (the reps/weight NumberFields link it). */}
      <NumericKeyboardAccessory />
    </SafeAreaView>
    </GymFrame>
  )

  // Whole-workout actions: a dropdown on web, an action sheet on a phone (Menu / Menu.web).
  // Minimize is the ⌄ beside it, not an item here. Discard still asks first. The overview
  // already shows the list, its Add Exercise and its reorder button, so there only Discard.
  const onExerciseScreen = phase !== 'overview'
  const activeGroup = groupOf(session.exercises, activeIdx)
  const pairCandidates = session.exercises.flatMap((e, index) =>
    index === activeIdx || (activeGroup && index >= activeGroup.start && index <= activeGroup.end)
      ? []
      : [{ index, name: e.exercise.name, muscle: muscleLabel(e.exercise.muscle_group), imageUrl: e.exercise.image_url }])

  // The store has no "pair" action, so the result of pairWith is written whole and the positional
  // indices (screen, running rest) follow the row that was moved, as moveExercise does.
  const pairExercise = (partner: number) => {
    const rows = session.exercises
    const next = pairWith(rows, activeIdx, partner)
    setSupersetOpen(false)
    if (next === rows) return
    const reordered = next.some((r, k) => r.exercise !== rows[k].exercise)
    const to = partner < activeIdx ? activeIdx : activeIdx + 1
    useWorkoutSession.getState().restoreSession({ ...session, exercises: next })
    if (reordered) {
      const st = useWorkoutSession.getState()
      setGymState(st.gymPhase, remapIndex(st.gymExIdx, partner, to), st.gymSetIdx)
      if (st.restExIdx != null) useWorkoutSession.setState({ restExIdx: remapIndex(st.restExIdx, partner, to) })
    }
    announce(t('workouts.superset.linkedA11y', { a: rows[activeIdx].exercise.name, b: rows[partner].exercise.name }))
  }

  // Taking one member out: split after it, and before it when it is not the first.
  const removeFromSuperset = () => {
    if (!activeGroup) return
    const names = { a: session.exercises[activeIdx].exercise.name, b: session.exercises[activeIdx + 1]?.exercise.name ?? session.exercises[activeIdx - 1]?.exercise.name ?? '' }
    if (activeIdx < activeGroup.end) unlinkFromNext(activeIdx)
    if (activeIdx > activeGroup.start) unlinkFromNext(activeIdx - 1)
    announce(t('workouts.superset.unlinkedA11y', names))
  }
  const menuItems: MenuItem[] = [
    ...(onExerciseScreen ? [{ label: t('gym.menu.addExercise'), icon: Plus, onSelect: () => setShowPicker(true) }] : []),
    ...(onExerciseScreen && session.exercises.length > 1
      ? [{ label: t('workouts.reorder.title'), icon: ArrowUpDown, onSelect: () => setExercisesSheet('reorder') }]
      : []),
    ...(onExerciseScreen ? [{ label: t('gym.menu.allExercises'), icon: List, onSelect: () => setExercisesSheet('list') }] : []),
    ...(onExerciseScreen && activeGroup
      ? [{ label: t('workouts.superset.menuRemove', { letter: activeGroup.letter }), icon: Unlink2, onSelect: removeFromSuperset }]
      : onExerciseScreen && pairCandidates.length > 0
        ? [{ label: t('workouts.superset.menuPair'), icon: Link2, onSelect: () => setSupersetOpen(true) }]
        : []),
    // With Back gone from the exercise screens, this is the way to the overview.
    ...(onExerciseScreen
      ? [{ label: t('gym.menu.overview'), icon: LayoutList, onSelect: () => { pendingFocus.current = minimizeRef; setPhase('overview') } }]
      : []),
    { label: t('gym.discardWorkout'), icon: Trash2, destructive: true, separated: true, onSelect: () => setConfirmCancel(true) },
  ]
  const setProgress = t('workouts.active.setProgress', { done: completedSets, total: totalSets })
  const moreMenu = (
    <Menu
      label={t('gym.menu.more')}
      title={t('gym.workout')}
      subtitle={session.name ? t('gym.menu.subtitle', { name: session.name, sets: setProgress }) : setProgress}
      items={menuItems}
      className="h-11 w-11 items-center justify-center rounded-xl active:bg-surface-muted"
    >
      <Ellipsis size={20} color={colors.txMuted} />
    </Menu>
  )

  const minimizeButton = (
    <Pressable ref={minimizeRef} onPress={handleMinimize} accessibilityRole="button" accessibilityLabel={t('gym.minimize')} className={`h-11 w-11 items-center justify-center rounded-xl active:bg-surface-muted ${interactive('hover:bg-surface-muted')}`}>
      <ChevronDown size={20} color={colors.txMuted} />
    </Pressable>
  )

  // Only whole-workout things up here: minimize, the clock over the set count, Finish and the
  // menu (kept last, at the right edge), every one a 44pt target. Where you are in the workout is the heading below it.
  const topBar = (
    <View className="flex-shrink-0">
      <View className="flex-row items-center gap-1 px-3 py-1.5">
        {minimizeButton}
        <ElapsedClock startedAt={session.started_at} done={completedSets} total={totalSets} />
        <Pressable onPress={() => setConfirmFinish(true)} accessibilityRole={WEB_BUTTON} accessibilityLabel={t('workouts.active.finish')} className={`h-11 w-11 items-center justify-center rounded-xl active:scale-95 ${allDone ? 'bg-brand-500' : 'active:bg-surface-muted'} ${interactive(allDone ? 'hover:bg-brand-600' : 'hover:bg-surface-muted')}`}>
          <Check size={20} color={allDone ? '#ffffff' : colors.txMuted} />
        </Pressable>
        {moreMenu}
      </View>
      <ProgressSegments values={exerciseFractions(session.exercises)} keys={occurrenceKeys(session.exercises.map((e) => e.exercise_id))} current={activeIdx} />
    </View>
  )

  const openSwitcher = () => setExercisesSheet('list')

  const pill = activeGroup ? (
    <SupersetPill
      letter={activeGroup.letter}
      round={currentRound(session.exercises, activeGroup.start, activeGroup.end)}
      total={totalRounds(session.exercises, activeGroup.start, activeGroup.end)}
      colorIndex={groupColorIndex(session.exercises, activeIdx)}
    />
  ) : null

  // ── Overview ──────────────────────────────────────────────
  if (phase === 'overview') {
    const muscles = [...new Set(session.exercises.map((e) => e.exercise.muscle_group))].length
    return overlay(
      <>
        <View className="flex-row items-center justify-between gap-2 border-b border-surface-border px-3 pb-3 pt-1.5">
          {minimizeButton}
          <View className="min-w-0 flex-1">
            <AppText variant="label" color="muted" className="uppercase">{t('gym.workout')}</AppText>
            <AppText variant="heading" numberOfLines={1}>{session.name}</AppText>
          </View>
          <View className="flex-row items-center gap-1">
            {session.exercises.length > 1 ? (
              <Pressable onPress={() => setExercisesSheet('reorder')} accessibilityRole={WEB_BUTTON} accessibilityLabel={t('workouts.reorder.title')} className={`h-11 w-11 items-center justify-center rounded-xl active:bg-surface-muted ${interactive('hover:bg-surface-muted')}`}>
                <ArrowUpDown size={18} color={colors.txMuted} />
              </Pressable>
            ) : null}
            {moreMenu}
          </View>
        </View>

        <View className="flex-row border-b border-surface-border px-5 py-4">
          {[
            { v: session.exercises.length, l: t('gym.overview.exercises') },
            { v: totalSets, l: t('gym.overview.totalSets') },
            { v: muscles, l: t('gym.overview.muscles') },
          ].map((s) => (
            <View key={s.l} className="flex-1 items-center">
              <Text className="font-display text-xl text-tx-primary" style={{ fontVariant: ['tabular-nums'] }}>{s.v}</Text>
              <AppText variant="label" color="muted" className="mt-0.5 uppercase">{s.l}</AppText>
            </View>
          ))}
        </View>

        {/* Focusable on web so a keyboard can scroll a long list: its rows are not buttons. */}
        <ScrollView focusable={web} className="flex-1" contentContainerStyle={{ padding: 20, gap: 8 }}>
          {session.exercises.length === 0 ? (
            <View className="items-center gap-3 py-16">
              <Dumbbell size={40} color={colors.txMuted} />
              <AppText variant="body" color="muted">{t('gym.overview.empty')}</AppText>
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
                      <MuscleBadge muscle={ex.exercise.muscle_group} border />
                      {supersetInfo(session.exercises, i) ? <SupersetMarker {...supersetInfo(session.exercises, i)!} /> : null}
                      <AppText variant="caption" color="muted">{t('common.count.sets', { count: ex.sets.length })}</AppText>
                    </View>
                  </View>
                  {done ? <CheckCircle2 size={16} color={accent} /> : null}
                </View>
              )
            })
          )}
        </ScrollView>

        <View className="gap-2 border-t border-surface-border px-5 pt-4" style={{ paddingBottom: restShown ? 16 : insets.bottom + 16 }}>
          <Pressable onPress={() => setShowPicker(true)} accessibilityRole={WEB_BUTTON} className={`flex-row items-center justify-center gap-2 rounded-2xl border border-surface-border bg-surface-muted py-3 active:scale-95 ${interactive('hover:bg-surface-border')}`}>
            <Plus size={16} color={colors.txSecondary} />
            <Text className="font-sans-semibold text-sm text-tx-secondary">{t('workouts.active.addExercise')}</Text>
          </Pressable>
          {session.exercises.length > 0 ? (
            <Pressable onPress={() => openExercise(Math.min(activeIdx, session.exercises.length - 1))} accessibilityRole={WEB_BUTTON} className={`flex-row items-center justify-center gap-2 rounded-2xl bg-brand-500 py-4 active:scale-95 ${interactive('hover:bg-brand-600')}`}>
              <Play size={20} color="#ffffff" />
              <Text className="font-sans-bold text-base text-white">{completedSets > 0 ? t('gym.overview.continueWorkout') : t('gym.overview.startWorkout')}</Text>
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
  const isLast = activeIdx === session.exercises.length - 1

  // ── Exercise info ─────────────────────────────────────────
  if (phase === 'exercise-info') {
    const exercise = ex.exercise
    const equipLabel = equipmentLabel(exercise.equipment)
    const descLines = exercise.description ? exercise.description.split('\n').filter((l) => l.trim()) : []
    const repsVals = ex.sets.map((s) => s.target_reps).filter((r) => r > 0)
    const wtVals = ex.sets.map((s) => displayWeight(s.target_weight, wUnit)).filter((w) => w > 0)
    const infoDetails = [
      muscleLabel(exercise.muscle_group),
      ...(equipLabel && exercise.equipment !== 'other' ? [equipLabel] : []),
      ...(exercise.category ? [categoryLabel(exercise.category)] : []),
    ]
    const planStats = [
      { icon: Layers, label: t('gym.labels.sets'), value: String(ex.sets.length) },
      { icon: Repeat, label: t('gym.labels.reps'), value: numericRange(repsVals) },
      { icon: Dumbbell, label: t('gym.labels.weight'), value: `${numericRange(wtVals)} ${wUnit}` },
    ]
    return overlay(
      <>
        {topBar}
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 20 }}>
          {exercise.image_url && !imgFailed ? (
            <Image source={{ uri: exercise.image_url }} onError={() => setImgFailed(true)} className="h-52 w-full bg-surface-muted" resizeMode="cover" />
          ) : null}
          <View className="gap-5 px-5 pb-4 pt-5">
            {/* The negative margin puts the button's padding in this view's padding, so the text
                lines up and the whole pressed area stays inside the parent (Android drops touches
                outside a parent's bounds). */}
            {pill}
            <View className="-mx-2 -my-1.5 flex-row">
              <ExerciseSwitcher ref={switcherRef} title name={exercise.name} current={activeIdx + 1} total={session.exercises.length} details={infoDetails} superset={supersetInfo(session.exercises, activeIdx)} onPress={openSwitcher}>
                <MuscleBadge muscle={exercise.muscle_group} wide border />
                {equipLabel && exercise.equipment !== 'other' ? (
                  <View className="rounded-full border border-surface-border bg-surface-muted px-3 py-1"><AppText variant="caption" color="secondary">{equipLabel}</AppText></View>
                ) : null}
                {exercise.category ? (
                  <View className="rounded-full border border-surface-border bg-surface-muted px-3 py-1"><AppText variant="caption" color="secondary" className="capitalize">{categoryLabel(exercise.category)}</AppText></View>
                ) : null}
              </ExerciseSwitcher>
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
                <AppText variant="label" color="muted" className="uppercase">{t('gym.info.restTitle')}</AppText>
              </View>
              <AppText variant="caption" color="muted" className="mb-3 mt-1">{t('gym.info.restHint')}</AppText>
              <View className="mt-3">
                <RestPicker value={ex.rest_seconds ?? (settings.rest_seconds_default ?? 90)} onChange={(secs) => setExerciseRest(activeIdx, secs)} />
              </View>
            </View>

            {exercise.secondary_muscles?.length > 0 ? (
              <View>
                <AppText variant="label" color="muted" className="mb-2 uppercase">{t('exercises.detail.alsoWorks')}</AppText>
                <View className="flex-row flex-wrap gap-1.5">
                  {exercise.secondary_muscles.map((m) => <MuscleBadge key={m} muscle={m} border />)}
                </View>
              </View>
            ) : null}

            {/* Muscle diagram */}
            <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <AppText variant="label" color="muted" className="mb-3 uppercase">{t('exercises.detail.musclesWorked')}</AppText>
              <MuscleDiagram exercise={exercise} />
            </View>

            {descLines.length > 0 ? (
              <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
                <AppText variant="label" color="muted" className="mb-3 uppercase">{t('exercises.detail.instructions')}</AppText>
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
        <View className="border-t border-surface-border px-5 pt-4" style={{ paddingBottom: restShown ? 16 : insets.bottom + 16 }}>
          <Pressable onPress={() => setPhase('exercise')} accessibilityRole={WEB_BUTTON} className={`flex-row items-center justify-center gap-2 rounded-2xl bg-brand-500 py-4 active:scale-95 ${interactive('hover:bg-brand-600')}`}>
            <Play size={20} color="#ffffff" />
            <Text className="font-sans-bold text-base text-white">{t('gym.info.begin')}</Text>
          </Pressable>
        </View>
      </>,
    )
  }

  // ── Exercise sets ─────────────────────────────────────────
  const allSetsComplete = ex.sets.length > 0 && ex.sets.every((s) => s.completed)
  const completedHere = ex.sets.filter((s) => s.completed).length
  const setsDoneHere = t('workouts.active.setsDone', { done: completedHere, count: ex.sets.length })
  const clampedSetIdx = Math.min(activeSetIdx, ex.sets.length - 1)
  const set = ex.sets[clampedSetIdx]

  const handleCompleteSetGym = (setIdx: number) => {
    // Done typing this set — drop the keyboard so the rest sheet doesn't animate in under
    // a raised keyboard (and pausing it later can't trigger a blur-reflow).
    Keyboard.dismiss()
    if (applyRestOnToggle(activeIdx, setIdx)) return
    // Satisfying "clunk" when a set lands (native-feel; web has none).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    const rows = useWorkoutSession.getState().session?.exercises ?? []
    const to = nextSupersetTarget(rows, activeIdx, setIdx)
    if (!to) return
    if (to.exIdx === activeIdx) { setActiveSetIdx(to.setIdx); return }
    setGymState('exercise', to.exIdx, to.setIdx)
    const message = t('gym.superset.next', { name: rows[to.exIdx].exercise.name, number: to.setIdx + 1 })
    announce(message)
    setToast(message)
  }

  const handleRemoveSet = (setIdx: number) => {
    removeSet(activeIdx, setIdx)
    setActiveSetIdx(Math.max(0, Math.min(setIdx, ex.sets.length - 2)))
  }

  if (!set) return null

  const restingHere = restExIdx === activeIdx
  const restGroup = restShown && restExIdx != null && restSetIdx != null ? groupOf(session.exercises, restExIdx) : null
  const roundView = !!restGroup && restExIdx != null && restSetIdx != null
    && activeIdx >= restGroup.start && activeIdx <= restGroup.end
    && roundRest(session.exercises, restExIdx, restSetIdx).rest

  let then: { text: string; rests: boolean } | null = null
  if (activeGroup && !set.completed) {
    const sim = session.exercises.map((r, k) => (k === activeIdx ? { ...r, sets: r.sets.map((s, si) => (si === clampedSetIdx ? { ...s, completed: true } : s)) } : r))
    const to = nextSupersetTarget(sim, activeIdx, clampedSetIdx)
    if (to) {
      const round = roundRest(sim, activeIdx, clampedSetIdx)
      const secs = sim[round.sourceExIdx]?.rest_seconds ?? settings.rest_seconds_default ?? 90
      const rests = round.rest && settings.rest_enabled !== false && secs > 0
      const args = { name: sim[to.exIdx].exercise.name, number: to.setIdx + 1 }
      then = { rests, text: rests ? t('gym.superset.thenRest', { ...args, rest: restLabel(secs) }) : t('gym.superset.thenStraight', args) }
    }
  }

  return overlay(
    <>
      {topBar}
      {/* name + muscle */}
      <View className="flex-shrink-0 border-b border-surface-border px-5 pb-3 pt-4">
        {pill ? <View className="mb-3">{pill}</View> : null}
        {/* Negative margin: see the info phase's switcher. */}
        <View className="-mx-2 -my-1.5 flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row">
            <ExerciseSwitcher ref={switcherRef} name={ex.exercise.name} current={activeIdx + 1} total={session.exercises.length} details={[muscleLabel(ex.exercise.muscle_group), setsDoneHere]} superset={supersetInfo(session.exercises, activeIdx)} onPress={openSwitcher}>
              <MuscleBadge muscle={ex.exercise.muscle_group} border />
              <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'] }}>{setsDoneHere}</AppText>
            </ExerciseSwitcher>
          </View>
          {!allSetsComplete ? (
            <Pressable onPress={() => (completedHere > 0 ? setConfirmRemove(true) : handleRemoveExercise())} accessibilityRole={WEB_BUTTON} accessibilityLabel={t('gym.removeExercise')} className={`h-11 w-11 items-center justify-center rounded-lg active:bg-error-500/10 ${interactive('hover:bg-error-500/10')}`}>
              <Trash2 size={16} color={colors.txMuted} />
            </Pressable>
          ) : null}
        </View>
        <View className="mt-2">
          <ExerciseNotes exIdx={activeIdx} notes={ex.notes} onSave={updateExerciseNotes} />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {roundView && restExIdx != null && restSetIdx != null ? (
          <View className="m-auto w-full items-center px-5 py-4">
            <RoundComplete rows={session.exercises} restExIdx={restExIdx} restSetIdx={restSetIdx} wUnit={wUnit} />
          </View>
        ) : (
        <View className={`m-auto w-full items-center px-5 ${restingHere ? 'gap-4 py-2' : 'gap-6 py-4'}`}>
          {/* set selector chips */}
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            {ex.sets.map((s, i) => {
              const resting = restingHere && restSetIdx === i
              return (
                <Pressable
                  key={i}
                  onPress={() => setActiveSetIdx(i)}
                  accessibilityRole={WEB_BUTTON}
                  {...(web ? { 'aria-pressed': i === clampedSetIdx } : {})}
                  accessibilityLabel={t(
                    s.completed
                      ? (resting ? 'gym.set.chipDoneResting' : 'gym.set.chipDone')
                      : (resting ? 'gym.set.chipResting' : 'gym.set.chip'),
                    { number: i + 1 },
                  )}
                  className={`h-11 min-w-[44px] flex-row items-center justify-center gap-1 rounded-full px-3 active:scale-95 ${
                    i === clampedSetIdx ? 'bg-brand-500' : s.completed ? `bg-brand-500/15 ${resting ? 'border border-brand-500/60' : ''}` : 'bg-surface-muted'
                  } ${interactive(i === clampedSetIdx ? '' : 'hover:bg-surface-border')}`}
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
              {t('gym.target.label')}{' '}<Text className="font-sans-semibold" style={{ color: colors.txSecondary, fontVariant: ['tabular-nums'] }}>{set.target_reps > 0 ? t('common.count.reps', { count: set.target_reps }) : t('gym.target.repsUnknown')}</Text>
              {set.target_weight > 0 ? <Text> · <Text className="font-sans-semibold" style={{ color: colors.txSecondary, fontVariant: ['tabular-nums'] }}>{displayWeight(set.target_weight, wUnit)} {wUnit}</Text></Text> : null}
            </AppText>
          ) : null}

          {/* reps + weight steppers */}
          <View className="w-full flex-row gap-3">
            <View className="flex-1">
              <StepperTile icon={Repeat} label={t('gym.labels.reps')} name={t('gym.labels.repsName')} step={REP_STEP} disabled={set.completed} onStep={(d) => updateSet(activeIdx, clampedSetIdx, 'actual_reps', clampStep(set.actual_reps || 0, d, { min: 0 }))}>
                <NumberField key={`reps-${activeIdx}-${clampedSetIdx}`} inputMode="numeric" value={set.actual_reps ? String(set.actual_reps) : ''} onChange={(v) => updateSet(activeIdx, clampedSetIdx, 'actual_reps', Math.round(clampValue(v)))} placeholder={set.target_reps > 0 ? String(set.target_reps) : '0'} disabled={set.completed} accessibilityLabel={t('gym.labels.reps')} inputAccessoryViewID={NUMERIC_ACCESSORY_ID} />
              </StepperTile>
            </View>
            <View className="flex-1">
              <StepperTile icon={Dumbbell} label={t('common.weightWithUnit', { unit: wUnit })} name={t('common.weightName')} step={PLATE_STEP} disabled={set.completed} onStep={(d) => updateSet(activeIdx, clampedSetIdx, 'actual_weight', displayToLbs(clampStep(displayWeight(set.actual_weight, wUnit), d, { min: 0 }), settings.weight_unit))}>
                <NumberField key={`wt-${activeIdx}-${clampedSetIdx}`} inputMode="decimal" value={set.actual_weight ? String(displayWeight(set.actual_weight, wUnit)) : ''} onChange={(v) => updateSet(activeIdx, clampedSetIdx, 'actual_weight', displayToLbs(clampValue(v), settings.weight_unit))} placeholder={set.target_weight > 0 ? String(displayWeight(set.target_weight, wUnit)) : '0'} disabled={set.completed} accessibilityLabel={t('gym.labels.weight')} inputAccessoryViewID={NUMERIC_ACCESSORY_ID} />
              </StepperTile>
            </View>
          </View>

          <View className="w-full items-center gap-3">
            <Pressable onPress={() => handleCompleteSetGym(clampedSetIdx)} accessibilityRole={WEB_BUTTON} className={`w-full flex-row items-center justify-center gap-3 rounded-2xl py-5 active:scale-95 ${set.completed ? 'border-2 border-brand-500/40 bg-brand-500/15' : 'bg-brand-500'} ${interactive(set.completed ? 'hover:bg-brand-500/25' : 'hover:bg-brand-600')}`}>
              <CheckCircle2 size={24} color={set.completed ? accent : '#ffffff'} />
              <Text className={`font-sans-bold text-base ${set.completed ? '' : 'text-white'}`} style={set.completed ? { color: accent } : undefined}>{set.completed ? t('gym.completed') : t('gym.completeSet')}</Text>
            </Pressable>
            {then ? <ThenCard text={then.text} rests={then.rests} colorIndex={groupColorIndex(session.exercises, activeIdx)} /> : null}
            {ex.sets.length > 1 && !set.completed ? (
              <Pressable onPress={() => handleRemoveSet(clampedSetIdx)} accessibilityRole={WEB_BUTTON} className={`min-h-11 justify-center px-3 active:opacity-60 ${interactive('rounded hover:opacity-70')}`}>
                <Text className="font-sans text-xs text-tx-muted">{t('gym.removeSet')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        )}
      </ScrollView>
      {toast ? <NextToast text={toast} /> : null}

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
          <Pressable onPress={() => setActiveSetIdx(clampedSetIdx - 1)} disabled={clampedSetIdx === 0} accessibilityRole={WEB_BUTTON} accessibilityLabel={web ? t('gym.previousSet') : undefined} className={`h-11 w-11 items-center justify-center rounded-xl border border-surface-border bg-surface-muted active:scale-95 ${clampedSetIdx === 0 ? 'opacity-30' : ''} ${interactive('hover:bg-surface-border', { disabled: clampedSetIdx === 0 })}`}>
            <ChevronLeft size={16} color={colors.txSecondary} />
          </Pressable>
          <Pressable onPress={() => { addSet(activeIdx); setActiveSetIdx(ex.sets.length) }} accessibilityRole={WEB_BUTTON} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-border py-3 active:opacity-60 ${interactive('hover:bg-surface-muted')}`}>
            <Plus size={14} color={colors.txMuted} />
            <Text className="font-sans-semibold text-xs text-tx-muted">{t('workouts.active.addSet')}</Text>
          </Pressable>
          <Pressable onPress={() => setActiveSetIdx(clampedSetIdx + 1)} disabled={clampedSetIdx >= ex.sets.length - 1} accessibilityRole={WEB_BUTTON} accessibilityLabel={web ? t('gym.nextSet') : undefined} className={`h-11 w-11 items-center justify-center rounded-xl border border-surface-border bg-surface-muted active:scale-95 ${clampedSetIdx >= ex.sets.length - 1 ? 'opacity-30' : ''} ${interactive('hover:bg-surface-border', { disabled: clampedSetIdx >= ex.sets.length - 1 })}`}>
            <ChevronRight size={16} color={colors.txSecondary} />
          </Pressable>
        </View>
        <View className="flex-row gap-2">
          <Pressable onPress={() => setPhase('exercise-info')} accessibilityRole={WEB_BUTTON} className={`flex-row items-center gap-1.5 rounded-xl border border-surface-border bg-surface-muted px-4 py-3 active:scale-95 ${interactive('hover:bg-surface-border')}`}>
            <ChevronLeft size={16} color={colors.txSecondary} />
            <Text className="font-sans-semibold text-sm text-tx-secondary">{t('gym.nav.info')}</Text>
          </Pressable>
          {isLast ? (
            <Pressable onPress={() => setConfirmFinish(true)} accessibilityRole={WEB_BUTTON} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 active:scale-95 ${allSetsComplete ? 'bg-brand-500' : 'border border-brand-500/30 bg-brand-500/10'} ${interactive(allSetsComplete ? 'hover:bg-brand-600' : 'hover:bg-brand-500/20')}`}>
              <Flag size={16} color={allSetsComplete ? '#ffffff' : accent} />
              <Text className={`font-sans-bold text-sm ${allSetsComplete ? 'text-white' : ''}`} style={allSetsComplete ? undefined : { color: accent }}>{t('gym.nav.finishWorkout')}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => openExercise(activeIdx + 1)} accessibilityRole={WEB_BUTTON} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 active:scale-95 ${allSetsComplete ? 'bg-brand-500' : 'border border-surface-border bg-surface-muted'} ${interactive(allSetsComplete ? 'hover:bg-brand-600' : 'hover:bg-surface-border')}`}>
              <Text className={`font-sans-bold text-sm ${allSetsComplete ? 'text-white' : 'text-tx-secondary'}`}>{t('gym.nav.nextExercise')}</Text>
              <ChevronRight size={16} color={allSetsComplete ? '#ffffff' : colors.txSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    </>,
  )
}

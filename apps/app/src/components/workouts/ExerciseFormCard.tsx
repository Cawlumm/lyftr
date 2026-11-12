import { Fragment, memo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Platform, Pressable, Text, TextInput, View, type TextInputInstance } from 'react-native'
import { FileText, Link2, Plus, Timer, Trash2, Unlink2, X } from '../ui/icons'
import {
  groupColorIndex, groupOf, isLinkedToNext, normaliseSupersets, pairWith, restLabel, totalRounds,
  type Exercise,
} from '@lyftr/shared'
import { AppText, IconButton, Label, Menu, TOUCH_MIN, touchPad } from '../ui'
import { ExerciseImage } from './ExerciseImage'
import { RestPicker } from './RestPicker'
import { equipmentLabel, muscleLabel, sanitizeNumericInput, useNumericText, useTranslation } from '@lyftr/shared'
import { useTheme } from '../../theme/useTheme'
import {
  AddSupersetPill, ExerciseThumb, SupersetBlock, SupersetConnector, SupersetRestFooter, SupersetSheet,
} from './superset'

interface SetData {
  set_number: number
  reps: number
  weight: number
}

interface Props {
  /** 0-based position in the workout — rendered as the 1-based order badge. Also passed
      back to every callback so the owning screen doesn't bind a fresh closure per card
      (that would defeat the memo below and re-render all cards on any edit). */
  index: number
  exercise?: Exercise
  notes: string
  sets: SetData[]
  restSeconds: number
  /** Display unit short label (lb/kg) — shown once in the column header, not per row. */
  unit: string
  onRemove: (index: number) => void
  onNotesChange: (index: number, text: string) => void
  onAddSet: (index: number) => void
  onRemoveSet: (index: number, setIdx: number) => void
  onUpdateSet: (index: number, setIdx: number, field: 'reps' | 'weight', value: string) => void
  onRestChange: (index: number, secs: number) => void
  /** Primitives, not an object, so the memo holds: set together when the card is in a superset. */
  supersetLetter?: string
  /** 1-based place inside the group. */
  supersetPosition?: number
  supersetTotal?: number
  /** From groupColorIndex; with the letter it is how the member's tag and tint are drawn. */
  supersetColor?: number
  /** Opens the superset sheet, or removes the card from its group when it is in one. Omit to hide the menu. */
  onSuperset?: (index: number) => void
  /** iOS: ties the numeric cells to the screen's keyboard "Done" accessory bar. */
  inputAccessoryViewID?: string
}

// Add Set and Note are 36px tall rows beside each other, so only their height is padded out.
const ROW_BUTTON = touchPad(TOUCH_MIN, 36)

// Compact spreadsheet cell: static border, no focus glow — never re-renders on focus
// (Fabric-safe by construction, same rationale as the screens' old COMPACT_INPUT).
const CELL = 'h-9 w-full rounded-lg border border-surface-border/60 bg-surface-overlay px-2 py-0 text-center font-sans text-sm text-tx-primary'

// Set-table column widths — header and rows must agree or the columns shear.
// COL_DELETE fits the 32pt IconButton; the IconButton pads itself out to a 44pt target.
const COL_SET = 'w-9'
const COL_DELETE = 'w-9'

// Weight gets its own component so each row can own a useNumericText buffer —
// preserves a trailing "." / leading "0" while the parent re-derives value as a
// number each keystroke (same contract as workouts/WeightInput, minus the inline
// unit suffix: in a table the unit lives in the column header once).
function WeightCell({ value, onChange, placeholderColor, inputRef, onNext, inputAccessoryViewID }: {
  value: string
  onChange: (next: string) => void
  placeholderColor: string
  /** Callback ref so the parent's focus chain can jump reps → weight. */
  inputRef?: (r: TextInputInstance | null) => void
  /** Present on all but the last set: Android's numeric "next" key hops to the next row's reps. */
  onNext?: () => void
  inputAccessoryViewID?: string
}) {
  const { t } = useTranslation()
  const [text, setText] = useNumericText(value)
  const emit = (raw: string) => {
    const v = sanitizeNumericInput(raw, 'decimal')
    setText(v)
    onChange(v)
  }
  return (
    <TextInput
      ref={inputRef}
      value={text}
      onChangeText={emit}
      keyboardType="decimal-pad"
      returnKeyType={onNext ? 'next' : 'done'}
      submitBehavior={onNext ? 'submit' : 'blurAndSubmit'}
      onSubmitEditing={onNext}
      selectTextOnFocus
      inputAccessoryViewID={inputAccessoryViewID}
      placeholder="0"
      placeholderTextColor={placeholderColor}
      accessibilityLabel={t('workouts.form.setWeightLabel')}
      className={CELL}
      style={{ fontVariant: ['tabular-nums'] }}
    />
  )
}

// One exercise inside the Log/Edit Workout form: header (order badge · name ·
// muscle) + a compact set table (columns declared once, one slim row per set —
// the Hevy/Strong spreadsheet pattern) + ghost Add Set. Notes are progressive
// disclosure: hidden behind a "Note" toggle until they exist. Purely
// presentational — all state stays in the owning screen.
function ExerciseFormCardBase({
  index, exercise, notes, sets, restSeconds, unit,
  onRemove, onNotesChange, onAddSet, onRemoveSet, onUpdateSet, onRestChange,
  inputAccessoryViewID, supersetLetter, supersetPosition, supersetTotal, supersetColor = 0, onSuperset,
}: Props) {
  const { t } = useTranslation()
  const { colors, accent } = useTheme()
  const inSuperset = !!supersetLetter && !!supersetPosition && !!supersetTotal
  // Rest runs once per round, after the last member (the block's footer says so); the others
  // keep their stored value for unlinking and show no rest control.
  const restsAfterRound = inSuperset && supersetPosition < supersetTotal
  // Once revealed the input stays mounted for the card's lifetime, so typed text
  // can never be hidden; cards with saved notes start revealed.
  const [showNotes, setShowNotes] = useState(notes.length > 0)
  // Focus chain (reps → weight → next row's reps) so a whole exercise logs off the
  // Android numeric keyboard's next key without re-tapping each cell. (iOS numeric
  // pads have no return key — there the accessory Done bar is the exit instead.)
  // Plain refs mutated in callback refs: never triggers a render (Fabric rule).
  const repsRefs = useRef<(TextInputInstance | null)[]>([])
  const weightRefs = useRef<(TextInputInstance | null)[]>([])

  return (
    <View className={inSuperset ? 'p-4' : 'rounded-2xl border border-surface-border bg-surface-muted/30 p-4'}>
      {/* Header: exercise thumbnail (with the order number tucked into a corner
          badge), name, muscle • equipment; muted (not red) remove — destructive
          styling is reserved for the confirm step, like the list screens. */}
      <View className="mb-3 flex-row items-center gap-3">
        {inSuperset ? (
          <ExerciseThumb url={exercise?.image_url} tag={`${supersetLetter}${supersetPosition}`} colorIndex={supersetColor} />
        ) : (
        <View className="relative">
          <ExerciseImage url={exercise?.image_url} />
          {/* Order number rides the thumbnail's corner so the image stays the anchor
              and we don't spend a second leading chip on it. */}
          <View className="absolute -left-1.5 -top-1.5 h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-surface-base bg-brand-500 px-1">
            {/* Nudge the digit up to optically center it in the circle (iOS renders the
                glyph a hair low within its line box). */}
            <AppText variant="caption" color="white" style={{ fontVariant: ['tabular-nums'], transform: [{ translateY: -1 }] }}>
              {index + 1}
            </AppText>
          </View>
        </View>
        )}
        <View className="flex-1">
          <AppText variant="bodySemibold" numberOfLines={1}>{exercise?.name}</AppText>
          <AppText variant="caption" color="muted" numberOfLines={1} className="capitalize">
            {muscleLabel(exercise?.muscle_group)} • {equipmentLabel(exercise?.equipment)}
          </AppText>
        </View>
        {onSuperset ? (
          <Menu
            label={t('gym.menu.more')}
            items={[{
              label: inSuperset ? t('workouts.superset.menuRemove', { letter: supersetLetter }) : t('workouts.superset.menuPair'),
              icon: inSuperset ? Unlink2 : Link2,
              onSelect: () => onSuperset(index),
            }]}
          />
        ) : null}
        <IconButton
          icon={Trash2}
          label={t('workouts.form.removeNamed', { name: exercise?.name ?? t('workouts.form.exerciseFallback') })}
          variant="ghost"
          size="sm"
          onPress={() => onRemove(index)}
        />
      </View>

      {/* Set table — column labels once, then one tight row per set. */}
      <View className="gap-1.5">
        <View className="flex-row items-center gap-2">
          <View className={`${COL_SET} items-center`}><Label>{t('workouts.form.set')}</Label></View>
          <View className="flex-1 items-center"><Label>{t('workouts.form.reps')}</Label></View>
          <View className="flex-1 items-center"><Label>{t('common.weightWithUnit', { unit })}</Label></View>
          <View className={COL_DELETE} />
        </View>
        {sets.map((set, setIdx) => (
          <View key={setIdx} className="flex-row items-center gap-2">
            <View className={`${COL_SET} items-center`}>
              <AppText variant="subheading" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
                {set.set_number}
              </AppText>
            </View>
            <View className="flex-1">
              <TextInput
                ref={(r) => { repsRefs.current[setIdx] = r }}
                value={set.reps ? String(set.reps) : ''}
                onChangeText={(text) => onUpdateSet(index, setIdx, 'reps', sanitizeNumericInput(text, 'numeric'))}
                keyboardType="number-pad"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => weightRefs.current[setIdx]?.focus()}
                selectTextOnFocus
                inputAccessoryViewID={inputAccessoryViewID}
                placeholder="0"
                placeholderTextColor={colors.txMuted}
                accessibilityLabel={t('workouts.form.setRepsLabel')}
                className={CELL}
                style={{ fontVariant: ['tabular-nums'] }}
              />
            </View>
            <View className="flex-1">
              <WeightCell
                value={set.weight ? String(set.weight) : ''}
                onChange={(v) => onUpdateSet(index, setIdx, 'weight', v)}
                placeholderColor={colors.txMuted}
                inputRef={(r) => { weightRefs.current[setIdx] = r }}
                onNext={setIdx < sets.length - 1
                  ? () => repsRefs.current[setIdx + 1]?.focus()
                  : undefined}
                inputAccessoryViewID={inputAccessoryViewID}
              />
            </View>
            <View className={`${COL_DELETE} items-center`}>
              <IconButton icon={X} label={t('workouts.form.removeSet')} variant="ghost" size="sm" onPress={() => onRemoveSet(index, setIdx)} />
            </View>
          </View>
        ))}
      </View>

      {/* Add Set + tucked Note toggle share a row: default surface stays set/reps/weight. */}
      <View className="mt-2.5 flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => onAddSet(index)}
          // 36pt row padded out to 44pt; the extra stays inside the surrounding whitespace
          // (mt-2.5 above, card padding below).
          style={ROW_BUTTON}
          className="flex-1 active:opacity-60"
        >
          <View className="h-9 flex-row items-center justify-center gap-1.5 rounded-lg border border-dashed border-surface-border">
            <Plus size={13} color={accent} />
            {/* accent (not text-brand-500): raw brand cyan washes out on light. */}
            <Text className="font-sans-semibold text-xs" style={{ color: accent }}>{t('workouts.form.addSet')}</Text>
          </View>
        </Pressable>
        {!showNotes && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workouts.form.addNoteLabel')}
            onPress={() => setShowNotes(true)}
            style={ROW_BUTTON}
            className="active:opacity-60"
          >
            <View className="h-9 flex-row items-center gap-1.5 rounded-lg px-3">
              <FileText size={13} color={colors.txMuted} />
              <Text className="font-sans-semibold text-xs text-tx-muted">{t('workouts.form.note')}</Text>
            </View>
          </Pressable>
        )}
      </View>

      {showNotes && (
        // The note is dismissible: the × clears the text AND hides the field (bringing
        // back the "Note" toggle), so a note added by mistake isn't stuck open/filled.
        <View className="mt-2.5 flex-row items-center gap-2">
          <TextInput
            value={notes}
            onChangeText={(text) => onNotesChange(index, text)}
            placeholder={t('workouts.form.exerciseNotesPlaceholder')}
            placeholderTextColor={colors.txMuted}
            accessibilityLabel={t('workouts.form.exerciseNotesLabel')}
            className="h-9 flex-1 rounded-lg border border-surface-border/60 bg-surface-overlay px-3 py-0 font-sans text-sm text-tx-primary"
          />
          <IconButton
            icon={X}
            label={t('workouts.form.removeNoteLabel')}
            variant="ghost"
            size="sm"
            onPress={() => { onNotesChange(index, ''); setShowNotes(false) }}
          />
        </View>
      )}

      {/* Rest-between-sets picker, tucked at the card foot. Rendered here (not passed as a
          JSX `footer` prop) so the card takes only stable, primitive props — an inline
          footer element would be a new reference every parent render and defeat the memo. */}
      {restsAfterRound ? null : (
        <View className="mt-3 border-t border-surface-border/60 pt-3">
          <View className="mb-1 flex-row items-center gap-1.5">
            <Timer size={13} color={accent} />
            <Label>{t('workouts.form.restBetweenSets')}</Label>
          </View>
          <RestPicker value={restSeconds} onChange={(secs) => onRestChange(index, secs)} />
        </View>
      )}
    </View>
  )
}

// Memoized: the Log/Edit forms hold ALL exercises in one state object, so any edit
// (even the duration stepper) re-renders the screen. Without this, all N cards re-render
// on every keystroke/tap — the visible stepper lag. Props are kept referentially stable
// by the screens (index-based useCallback handlers + primitive values), so only the card
// whose data actually changed re-renders.
export const ExerciseFormCard = memo(ExerciseFormCardBase)

type CardHandlers = Pick<Props,
  'onRemove' | 'onNotesChange' | 'onAddSet' | 'onRemoveSet' | 'onUpdateSet' | 'onRestChange'>

export interface FormRow {
  exercise_id: number
  notes: string
  rest_seconds?: number | null
  superset_group?: number | null
  sets: SetData[]
}

interface ListProps<T extends FormRow> extends CardHandlers {
  exercises: T[]
  rowKeys: string[]
  pickerExercises: Record<number, Exercise>
  unit: string
  /** Applies a pure rewrite of the row list (link, move, unlink) to the owner's state. */
  onRewrite: (fn: (rows: T[]) => T[]) => void
  inputAccessoryViewID?: string
}

const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const

// The editors' exercise list: standalone cards, and one SupersetBlock around each run of linked
// members (connector between members, rest footer after the last). Linking lives in each card's
// menu and in the "+ Superset" pill between unlinked neighbours; both open the same sheet.
export function ExerciseFormList<T extends FormRow>({
  exercises, rowKeys, pickerExercises, unit, onRewrite, inputAccessoryViewID, ...handlers
}: ListProps<T>) {
  const { t } = useTranslation()
  const [sheet, setSheet] = useState<{ index: number; preselect?: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const nameAt = (i: number) => pickerExercises[exercises[i]?.exercise_id]?.name ?? t('workouts.form.exerciseFallback')

  const announce = (msg: string) => {
    if (Platform.OS === 'web') setAnnouncement(msg)
    else AccessibilityInfo.announceForAccessibility(msg)
  }

  const onSuperset = (i: number) => {
    const g = groupOf(exercises, i)
    if (!g) { setSheet({ index: i }); return }
    onRewrite((rows) => normaliseSupersets(rows.map((r, k) => (k === i ? { ...r, superset_group: null } : r))))
    announce(t('workouts.superset.unlinkedA11y', { a: nameAt(i), b: nameAt(i === g.start ? i + 1 : i - 1) }))
  }

  const create = (partner: number) => {
    if (!sheet) return
    const from = sheet.index
    onRewrite((rows) => pairWith(rows, from, partner))
    announce(t('workouts.superset.linkedA11y', { a: nameAt(from), b: nameAt(partner) }))
    setSheet(null)
  }

  const card = (i: number, g: { letter: string; start: number; end: number } | null) => (
    <ExerciseFormCard
      index={i}
      exercise={pickerExercises[exercises[i].exercise_id]}
      notes={exercises[i].notes}
      sets={exercises[i].sets}
      restSeconds={exercises[i].rest_seconds ?? 90}
      unit={unit}
      inputAccessoryViewID={inputAccessoryViewID}
      supersetLetter={g?.letter}
      supersetPosition={g ? i - g.start + 1 : undefined}
      supersetTotal={g ? g.end - g.start + 1 : undefined}
      supersetColor={g ? groupColorIndex(exercises, i) : undefined}
      onSuperset={exercises.length > 1 || g ? onSuperset : undefined}
      {...handlers}
    />
  )

  const segments: ReactNode[] = []
  for (let i = 0; i < exercises.length;) {
    const g = groupOf(exercises, i)
    const end = g && g.start === i ? g.end : i
    if (g && g.start === i) {
      const colorIndex = groupColorIndex(exercises, i)
      const last = exercises[end]
      segments.push(
        <SupersetBlock
          key={rowKeys[i]}
          letter={g.letter}
          colorIndex={colorIndex}
          count={end - i + 1}
          round={0}
          total={totalRounds(exercises, i, end)}
          footer={
            <SupersetRestFooter
              rest={restLabel(last.rest_seconds ?? 90)}
              afterName={nameAt(end)}
              colorIndex={colorIndex}
            />
          }
        >
          {Array.from({ length: end - i + 1 }, (_, k) => (
            <Fragment key={rowKeys[i + k]}>
              {k > 0 ? <SupersetConnector nextName={nameAt(i + k)} colorIndex={colorIndex} /> : null}
              {card(i + k, g)}
            </Fragment>
          ))}
        </SupersetBlock>,
      )
    } else {
      segments.push(<Fragment key={rowKeys[i]}>{card(i, null)}</Fragment>)
    }
    if (end < exercises.length - 1 && !isLinkedToNext(exercises, end)) {
      segments.push(
        <AddSupersetPill
          key={`pill-${rowKeys[end]}`}
          aName={nameAt(end)}
          bName={nameAt(end + 1)}
          onPress={() => setSheet({ index: end, preselect: end + 1 })}
        />,
      )
    }
    i = end + 1
  }

  const candidates = sheet
    ? exercises
        .map((e, index) => ({ e, index }))
        .filter(({ index }) => {
          if (index === sheet.index) return false
          const g = groupOf(exercises, sheet.index)
          return !(g && index >= g.start && index <= g.end)
        })
        .map(({ e, index }) => ({
          index,
          name: nameAt(index),
          muscle: muscleLabel(pickerExercises[e.exercise_id]?.muscle_group),
          imageUrl: pickerExercises[e.exercise_id]?.image_url,
        }))
    : []

  return (
    <>
      {segments}
      {Platform.OS === 'web' ? (
        <View accessibilityLiveRegion="polite" style={SR_ONLY}><AppText>{announcement}</AppText></View>
      ) : null}
      <SupersetSheet
        visible={sheet !== null}
        currentName={sheet ? nameAt(sheet.index) : ''}
        currentIndex={sheet?.index}
        candidates={candidates}
        preselect={sheet?.preselect}
        restLabel={sheet ? restLabel(exercises[sheet.index].rest_seconds ?? 90) : undefined}
        onCreate={create}
        onClose={() => setSheet(null)}
      />
    </>
  )
}

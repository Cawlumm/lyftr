import { memo, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { FileText, Plus, Timer, Trash2, X } from 'lucide-react-native'
import type { Exercise } from '@lyftr/shared'
import { AppText, IconButton, Label } from '../ui'
import { ExerciseImage } from './ExerciseImage'
import { RestPicker } from './RestPicker'
import { useNumericText } from '../../hooks/useNumericText'
import { useTheme } from '../../theme/useTheme'

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
  /** iOS: ties the numeric cells to the screen's keyboard "Done" accessory bar. */
  inputAccessoryViewID?: string
}

// Compact spreadsheet cell: static border, no focus glow — never re-renders on focus
// (Fabric-safe by construction, same rationale as the screens' old COMPACT_INPUT).
const CELL = 'h-9 flex-1 rounded-lg border border-surface-border/60 bg-surface-overlay px-2 py-0 text-center font-sans text-sm text-tx-primary'

// Set-table column widths — header and rows must agree or the columns shear.
// COL_DELETE fits the 32pt IconButton so its hitSlop isn't clipped by the parent
// (hitSlop outside parent bounds is unreliable on Android) → ~44pt effective target.
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
  inputRef?: (r: TextInput | null) => void
  /** Present on all but the last set: Android's numeric "next" key hops to the next row's reps. */
  onNext?: () => void
  inputAccessoryViewID?: string
}) {
  const [text, setText] = useNumericText(value)
  const emit = (raw: string) => {
    let v = raw.replace(/[^0-9.]/g, '')
    const i = v.indexOf('.')
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
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
      accessibilityLabel="Set weight"
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
  inputAccessoryViewID,
}: Props) {
  const { colors, accent } = useTheme()
  // Once revealed the input stays mounted for the card's lifetime, so typed text
  // can never be hidden; cards with saved notes start revealed.
  const [showNotes, setShowNotes] = useState(notes.length > 0)
  // Focus chain (reps → weight → next row's reps) so a whole exercise logs off the
  // Android numeric keyboard's next key without re-tapping each cell. (iOS numeric
  // pads have no return key — there the accessory Done bar is the exit instead.)
  // Plain refs mutated in callback refs: never triggers a render (Fabric rule).
  const repsRefs = useRef<(TextInput | null)[]>([])
  const weightRefs = useRef<(TextInput | null)[]>([])

  return (
    <View className="rounded-2xl border border-surface-border bg-surface-muted/30 p-4">
      {/* Header: exercise thumbnail (with the order number tucked into a corner
          badge), name, muscle • equipment; muted (not red) remove — destructive
          styling is reserved for the confirm step, like the list screens. */}
      <View className="mb-3 flex-row items-center gap-3">
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
        <View className="flex-1">
          <AppText variant="bodySemibold" numberOfLines={1}>{exercise?.name}</AppText>
          <AppText variant="caption" color="muted" numberOfLines={1}>
            {exercise?.muscle_group} • {exercise?.equipment}
          </AppText>
        </View>
        <IconButton
          icon={Trash2}
          label={`Remove ${exercise?.name ?? 'exercise'}`}
          variant="ghost"
          size="sm"
          onPress={() => onRemove(index)}
        />
      </View>

      {/* Set table — column labels once, then one tight row per set. */}
      <View className="gap-1.5">
        <View className="flex-row items-center gap-2">
          <View className={`${COL_SET} items-center`}><Label>Set</Label></View>
          <View className="flex-1 items-center"><Label>Reps</Label></View>
          <View className="flex-1 items-center"><Label>{`Weight (${unit})`}</Label></View>
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
                onChangeText={(t) => onUpdateSet(index, setIdx, 'reps', t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => weightRefs.current[setIdx]?.focus()}
                selectTextOnFocus
                inputAccessoryViewID={inputAccessoryViewID}
                placeholder="0"
                placeholderTextColor={colors.txMuted}
                accessibilityLabel="Set reps"
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
              <IconButton icon={X} label="Remove set" variant="ghost" size="sm" onPress={() => onRemoveSet(index, setIdx)} />
            </View>
          </View>
        ))}
      </View>

      {/* Add Set + tucked Note toggle share a row: default surface stays set/reps/weight. */}
      <View className="mt-2.5 flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => onAddSet(index)}
          // 36pt row + 6pt vertical slop ≈ 48pt effective target; the slop stays
          // inside the surrounding whitespace (mt-2.5 above, card padding below).
          hitSlop={{ top: 6, bottom: 6 }}
          className="h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-dashed border-surface-border active:opacity-60"
        >
          <Plus size={13} color={accent} />
          {/* accent (not text-brand-500): raw brand cyan washes out on light. */}
          <Text className="font-sans-semibold text-xs" style={{ color: accent }}>Add Set</Text>
        </Pressable>
        {!showNotes && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add exercise note"
            onPress={() => setShowNotes(true)}
            hitSlop={{ top: 6, bottom: 6 }}
            className="h-9 flex-row items-center gap-1.5 rounded-lg px-3 active:opacity-60"
          >
            <FileText size={13} color={colors.txMuted} />
            <Text className="font-sans-semibold text-xs text-tx-muted">Note</Text>
          </Pressable>
        )}
      </View>

      {showNotes && (
        // The note is dismissible: the × clears the text AND hides the field (bringing
        // back the "Note" toggle), so a note added by mistake isn't stuck open/filled.
        <View className="mt-2.5 flex-row items-center gap-2">
          <TextInput
            value={notes}
            onChangeText={(t) => onNotesChange(index, t)}
            placeholder="e.g., Felt strong"
            placeholderTextColor={colors.txMuted}
            accessibilityLabel="Exercise notes"
            className="h-9 flex-1 rounded-lg border border-surface-border/60 bg-surface-overlay px-3 py-0 font-sans text-sm text-tx-primary"
          />
          <IconButton
            icon={X}
            label="Remove note"
            variant="ghost"
            size="sm"
            onPress={() => { onNotesChange(index, ''); setShowNotes(false) }}
          />
        </View>
      )}

      {/* Rest-between-sets picker, tucked at the card foot. Rendered here (not passed as a
          JSX `footer` prop) so the card takes only stable, primitive props — an inline
          footer element would be a new reference every parent render and defeat the memo. */}
      <View className="mt-3 border-t border-surface-border/60 pt-3">
        <View className="mb-1 flex-row items-center gap-1.5">
          <Timer size={13} color={accent} />
          <Label>Rest between sets</Label>
        </View>
        <RestPicker value={restSeconds} onChange={(secs) => onRestChange(index, secs)} />
      </View>
    </View>
  )
}

// Memoized: the Log/Edit forms hold ALL exercises in one state object, so any edit
// (even the duration stepper) re-renders the screen. Without this, all N cards re-render
// on every keystroke/tap — the visible stepper lag. Props are kept referentially stable
// by the screens (index-based useCallback handlers + primitive values), so only the card
// whose data actually changed re-renders.
export const ExerciseFormCard = memo(ExerciseFormCardBase)

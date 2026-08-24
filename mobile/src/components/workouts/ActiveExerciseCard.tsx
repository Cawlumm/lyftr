import { memo } from 'react'
import { Pressable, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import { router, type Href } from 'expo-router'
import { CheckCircle2, ChevronLeft, ChevronRight, Flag, Plus, X } from 'lucide-react-native'
import { displayToLbs, displayWeight, sanitizeNumericInput, toLocaleText, useNumericText, type ActiveSessionExercise } from '@lyftr/shared'
import { AppText, NUMERIC_ACCESSORY_ID } from '../ui'
import { ExerciseImage } from './ExerciseImage'
import { useTheme } from '../../theme/useTheme'
import { muscleColor } from '../../utils/exerciseUtils'

const exerciseHref = (id: number) => `/workouts/exercise/${id}` as unknown as Href

const CELL = 'h-11 flex-1 rounded-lg border border-surface-border/60 bg-surface-overlay px-2 text-center font-sans text-base text-tx-primary'

// Weight gets its own component so each row can own a useNumericText buffer, the same
// contract ExerciseFormCard's WeightCell uses. Without it the separator is unenterable:
// the parent re-derives `value` from a number every keystroke, so typing "12." stores
// Number("12.") === 12, re-renders as "12", and RN's TextInput pushes that back into the
// native field — deleting the separator before the fractional digit can be typed. That
// made #141 look fixed while the List view (the default layout) still could not accept
// 12,5 or 12.5. Holding the raw text here is what lets a trailing separator survive.
function WeightCell({ value, editable, placeholder, placeholderColor, accessibilityLabel, onChange }: {
  value: string
  editable: boolean
  placeholder: string
  placeholderColor: string
  accessibilityLabel: string
  onChange: (next: string) => void
}) {
  const [text, setText] = useNumericText(value)
  return (
    <TextInput
      editable={editable}
      value={toLocaleText(text)}
      onChangeText={(raw) => {
        const v = sanitizeNumericInput(raw, 'decimal')
        setText(v)
        onChange(v)
      }}
      keyboardType="decimal-pad"
      inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
      placeholder={placeholder}
      placeholderTextColor={placeholderColor}
      className={`${CELL} ${editable ? '' : 'opacity-40'}`}
      style={{ fontVariant: ['tabular-nums'] }}
      accessibilityLabel={accessibilityLabel}
    />
  )
}

interface Props {
  /** Position in the session — rendered as-is in callbacks so the owning screen
      doesn't bind a fresh closure per card (that would defeat the memo below and
      re-render every card on the per-second elapsed-time tick). */
  index: number
  ex: ActiveSessionExercise
  isActive: boolean
  isLast: boolean
  wUnit: string
  weightUnit: 'lbs' | 'kg'
  onCardLayout: (index: number, y: number) => void
  onRemoveExercise: (index: number) => void
  onNotesChange: (index: number, text: string) => void
  onAddSet: (index: number) => void
  onRemoveSet: (index: number, setIdx: number) => void
  onUpdateSet: (index: number, setIdx: number, field: 'actual_reps' | 'actual_weight', value: number) => void
  onCompleteSet: (index: number, setIdx: number) => void
  onJumpToExercise: (index: number) => void
  onRequestFinish: () => void
}

// One exercise inside the active-workout screen: header (thumbnail · name ·
// muscle · remove) + notes + the live set table (reps/weight inputs + complete
// toggle) + prev/add-set/next-or-finish row. Extracted out of active.tsx and
// memoized so the screen's per-second elapsed-time re-render doesn't cascade
// into every exercise's ~2 TextInputs-per-set (same fix as ExerciseFormCard).
function ActiveExerciseCardBase({
  index, ex, isActive, isLast, wUnit, weightUnit,
  onCardLayout, onRemoveExercise, onNotesChange, onAddSet, onRemoveSet, onUpdateSet, onCompleteSet,
  onJumpToExercise, onRequestFinish,
}: Props) {
  const { colors, accent } = useTheme()
  const allSetsComplete = ex.sets.length > 0 && ex.sets.every((s) => s.completed)
  const completedHere = ex.sets.filter((s) => s.completed).length
  const tint = muscleColor(ex.exercise.muscle_group)

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => onCardLayout(index, e.nativeEvent.layout.y)}
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
          <Pressable onPress={() => onRemoveExercise(index)} hitSlop={6} accessibilityLabel="Remove exercise" className="h-9 w-9 items-center justify-center rounded-xl active:bg-error-500/10">
            <X size={16} color={colors.txMuted} />
          </Pressable>
        )}
      </View>

      {/* Notes */}
      <View className="px-4 pb-2">
        <TextInput
          defaultValue={ex.notes}
          onEndEditing={(e) => onNotesChange(index, e.nativeEvent.text)}
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
                  onChangeText={(t) => onUpdateSet(index, setIdx, 'actual_reps', Number(sanitizeNumericInput(t, 'numeric')) || 0)}
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
                <WeightCell
                  editable={!set.completed}
                  value={set.actual_weight ? String(displayWeight(set.actual_weight, wUnit)) : ''}
                  onChange={(v) => onUpdateSet(index, setIdx, 'actual_weight', displayToLbs(Number(v) || 0, weightUnit))}
                  placeholder={set.target_weight > 0 ? String(displayWeight(set.target_weight, wUnit)) : '—'}
                  placeholderColor={colors.txMuted}
                  accessibilityLabel={`Weight, set ${set.set_number}, ${ex.exercise.name}`}
                />
              </View>
              <Pressable
                onPress={() => onCompleteSet(index, setIdx)}
                className={`h-11 w-12 items-center justify-center ${set.completed ? 'bg-brand-500' : isNextSet ? 'bg-brand-500/20' : ''}`}
                accessibilityRole="button"
                accessibilityLabel={`${set.completed ? 'Completed' : 'Complete'} set ${set.set_number}, ${ex.exercise.name}`}
              >
                <CheckCircle2 size={24} color={set.completed ? '#ffffff' : isNextSet ? accent : colors.txMuted} />
              </Pressable>
              <Pressable onPress={() => onRemoveSet(index, setIdx)} hitSlop={6} accessibilityLabel="Remove set" className="w-7 items-center justify-center">
                <X size={14} color={colors.txMuted} />
              </Pressable>
            </View>
          )
        })}

        {/* Add Set / Prev / Next / Finish */}
        <View className="mt-1 flex-row gap-2">
          {isActive && index > 0 ? (
            <Pressable onPress={() => onJumpToExercise(index - 1)} accessibilityLabel="Previous exercise" className="items-center justify-center rounded-xl border border-surface-border bg-surface-muted px-3 py-2.5 active:scale-95">
              <ChevronLeft size={16} color={colors.txSecondary} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => onAddSet(index)} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-border py-2.5 active:opacity-60">
            <Plus size={14} color={colors.txMuted} />
            <Text className="font-sans-semibold text-xs text-tx-muted">Add Set</Text>
          </Pressable>
          {isActive && !isLast ? (
            <Pressable onPress={() => onJumpToExercise(index + 1)} className={`flex-row items-center justify-center gap-1 rounded-xl px-3 py-2.5 active:scale-95 ${allSetsComplete ? 'bg-brand-500' : 'border border-surface-border bg-surface-muted'}`}>
              <Text className={`font-sans-semibold text-xs ${allSetsComplete ? 'text-white' : 'text-tx-secondary'}`}>Next</Text>
              <ChevronRight size={14} color={allSetsComplete ? '#ffffff' : colors.txSecondary} />
            </Pressable>
          ) : null}
          {isActive && isLast ? (
            <Pressable onPress={onRequestFinish} className={`flex-row items-center justify-center gap-1 rounded-xl px-3 py-2.5 active:scale-95 ${allSetsComplete ? 'bg-brand-500' : 'border border-surface-border bg-surface-muted'}`}>
              <Flag size={14} color={allSetsComplete ? '#ffffff' : colors.txSecondary} />
              <Text className={`font-sans-semibold text-xs ${allSetsComplete ? 'text-white' : 'text-tx-secondary'}`}>Finish</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

export const ActiveExerciseCard = memo(ActiveExerciseCardBase)

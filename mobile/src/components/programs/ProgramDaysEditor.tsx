import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { ChevronDown, ChevronRight, ChevronUp, Dumbbell, Moon, Plus, Trash2 } from 'lucide-react-native'
import type { Exercise } from '@lyftr/shared'
import { AppText, Field, IconButton, SegmentedControl } from '../ui'
import { useTheme } from '../../theme/useTheme'
import { DayExercisesEditor } from './DayExercisesEditor'
import type { DayDraft } from './types'

interface Props {
  days: DayDraft[]
  onChange: (days: DayDraft[]) => void
  pickerExercises: Record<number, Exercise>
  onCacheExercise: (ex: Exercise) => void
  unit: string
  restSecondsDefault: number
  inputAccessoryViewID?: string
}

const reindex = (days: DayDraft[]): DayDraft[] => days.map((d, i) => ({ ...d, order_index: i }))

// The program's day/rest-day cycle, in order. Add/remove/reorder days here; each
// workout day expands to the (unchanged) per-day exercise editor. Port of
// web/components/programs/ProgramDaysEditor.tsx.
export function ProgramDaysEditor({
  days, onChange, pickerExercises, onCacheExercise, unit, restSecondsDefault, inputAccessoryViewID,
}: Props) {
  const { colors, accent } = useTheme()
  const [expanded, setExpanded] = useState<number | null>(() => days.findIndex((d) => !d.is_rest_day))

  const addDay = (isRest: boolean) => {
    const next = reindex([...days, { order_index: days.length, is_rest_day: isRest, name: '', exercises: [] }])
    onChange(next)
    setExpanded(next.length - 1)
  }

  const removeDay = (idx: number) => {
    onChange(reindex(days.filter((_, i) => i !== idx)))
    setExpanded(null)
  }

  const moveDay = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= days.length) return
    const next = [...days]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(reindex(next))
    if (expanded === idx) setExpanded(target)
    else if (expanded === target) setExpanded(idx)
  }

  const updateDay = (idx: number, patch: Partial<DayDraft>) => {
    const next = [...days]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }

  const setDayType = (idx: number, isRest: boolean) => {
    const day = days[idx]
    if (day.is_rest_day === isRest) return
    // Switching to rest clears its exercises — a rest day never carries any.
    updateDay(idx, { is_rest_day: isRest, exercises: isRest ? [] : day.exercises })
  }

  return (
    <View className="gap-3">
      {days.length === 0 ? (
        <AppText variant="caption" color="muted" className="py-4 text-center">
          No days yet — add a workout or rest day below.
        </AppText>
      ) : null}

      {days.map((day, idx) => {
        const isOpen = expanded === idx
        return (
          <View
            key={idx}
            className={`overflow-hidden rounded-2xl border ${day.is_rest_day ? 'border-surface-border bg-surface-muted/20' : 'border-surface-border bg-surface-raised'}`}
          >
            <View className="flex-row items-center gap-2 p-3">
              <View className="flex-shrink-0">
                <Pressable accessibilityRole="button" accessibilityLabel={`Move day ${idx + 1} up`} onPress={() => moveDay(idx, -1)} disabled={idx === 0} hitSlop={4} className={idx === 0 ? 'opacity-20' : 'active:opacity-60'}>
                  <ChevronUp size={16} color={colors.txMuted} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Move day ${idx + 1} down`} onPress={() => moveDay(idx, 1)} disabled={idx === days.length - 1} hitSlop={4} className={idx === days.length - 1 ? 'opacity-20' : 'active:opacity-60'}>
                  <ChevronDown size={16} color={colors.txMuted} />
                </Pressable>
              </View>

              <View className={`h-8 w-8 items-center justify-center rounded-lg ${day.is_rest_day ? 'bg-surface-muted' : 'bg-brand-500/15'}`}>
                {day.is_rest_day ? <Moon size={16} color={colors.txMuted} /> : <Dumbbell size={16} color={accent} />}
              </View>

              <View className="flex-1">
                <Field
                  value={day.name}
                  onChangeText={(t) => updateDay(idx, { name: t })}
                  placeholder={day.is_rest_day ? `Rest Day ${idx + 1}` : `Day ${idx + 1}`}
                />
              </View>

              <IconButton icon={Trash2} label="Remove day" variant="ghost" size="sm" onPress={() => removeDay(idx)} />
            </View>

            <View className="px-3 pb-3">
              <SegmentedControl
                size="sm"
                options={[{ value: 'workout', label: 'Workout' }, { value: 'rest', label: 'Rest' }] as const}
                value={day.is_rest_day ? 'rest' : 'workout'}
                onChange={(v) => setDayType(idx, v === 'rest')}
              />
            </View>

            {!day.is_rest_day && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setExpanded(isOpen ? null : idx)}
                className="flex-row items-center justify-between border-t border-surface-border/60 px-3 py-2.5 active:bg-surface-muted/40"
              >
                <AppText variant="caption" color="muted">
                  {day.exercises.length} exercise{day.exercises.length === 1 ? '' : 's'}
                </AppText>
                {isOpen ? <ChevronDown size={14} color={colors.txMuted} /> : <ChevronRight size={14} color={colors.txMuted} />}
              </Pressable>
            )}

            {!day.is_rest_day && isOpen && (
              <View className="border-t border-surface-border/60 p-3">
                <DayExercisesEditor
                  exercises={day.exercises}
                  onChange={(exercises) => updateDay(idx, { exercises })}
                  pickerExercises={pickerExercises}
                  onCacheExercise={onCacheExercise}
                  unit={unit}
                  restSecondsDefault={restSecondsDefault}
                  inputAccessoryViewID={inputAccessoryViewID}
                />
              </View>
            )}
          </View>
        )
      })}

      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => addDay(false)}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/10 py-2.5 active:scale-95"
        >
          <Plus size={14} color={accent} />
          <AppText variant="label" style={{ color: accent }}>Add Workout Day</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => addDay(true)}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-surface-border bg-surface-muted py-2.5 active:scale-95"
        >
          <Moon size={14} color={colors.txMuted} />
          <AppText variant="label" color="secondary">Add Rest Day</AppText>
        </Pressable>
      </View>
    </View>
  )
}

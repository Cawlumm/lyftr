import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { ChevronDown, ChevronRight, ChevronUp, Dumbbell, Moon, Plus, Trash2 } from '../ui/icons'
import { useTranslation, type Exercise } from '@lyftr/shared'
import { AppText, Field, IconButton, SegmentedControl, TOUCH_MIN, interactive, touchPad } from '../ui'
import { useTheme } from '../../theme/useTheme'
import { DayExercisesEditor } from './DayExercisesEditor'
import type { DayDraft } from './types'
import { appendDay, removeDayAt, moveDayBy, patchDayAt } from '@lyftr/shared'

interface Props {
  days: DayDraft[]
  onChange: (days: DayDraft[]) => void
  pickerExercises: Record<number, Exercise>
  onCacheExercise: (ex: Exercise) => void
  unit: string
  restSecondsDefault: number
  inputAccessoryViewID?: string
}

// The two arrows are 16px glyphs stacked flush, so they cannot each be 44 tall without
// overlapping: each takes 6px outward (22 in all, 44 together) and the full 44 across. The card
// pads 12px on the left, so the extra width goes mostly right. The stack carries zIndex 1 (a View
// is its own stacking context): the day icon after it would otherwise sit over the part of the
// box that reaches over it.
const ARROW = { paddingLeft: 12, paddingRight: 16, marginLeft: -12, marginRight: -16 }
const MOVE_UP = { ...ARROW, paddingTop: 6, marginTop: -6 }
const MOVE_DOWN = { ...ARROW, paddingBottom: 6, marginBottom: -6 }
// Full width, so only the 36px height is padded out.
const ADD_DAY = touchPad(TOUCH_MIN, 36)

// The program's day/rest-day cycle, in order. Add/remove/reorder days here; each
// workout day expands to the (unchanged) per-day exercise editor. The array operations
// come from @lyftr/shared — only the `expanded` row bookkeeping below is mobile's.
export function ProgramDaysEditor({
  days, onChange, pickerExercises, onCacheExercise, unit, restSecondsDefault, inputAccessoryViewID,
}: Props) {
  const { t } = useTranslation()
  const { colors, accent } = useTheme()
  const [expanded, setExpanded] = useState<number | null>(() => days.findIndex((d) => !d.is_rest_day))

  const addDay = (isRest: boolean) => {
    const next = appendDay(days, isRest)
    onChange(next)
    setExpanded(next.length - 1)
  }

  const removeDay = (idx: number) => {
    onChange(removeDayAt(days, idx))
    setExpanded(null)
  }

  const moveDay = (idx: number, dir: -1 | 1) => {
    const next = moveDayBy(days, idx, dir)
    if (next === days) return // move fell off the end — nothing changed
    onChange(next)
    if (expanded === idx) setExpanded(idx + dir)
    else if (expanded === idx + dir) setExpanded(idx)
  }

  const updateDay = (idx: number, patch: Partial<DayDraft>) => onChange(patchDayAt(days, idx, patch))

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
          {t('programs.form.daysEditor.empty')}
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
              <View className="flex-shrink-0" style={{ zIndex: 1 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('programs.form.daysEditor.moveUpNumbered', { number: idx + 1 })} onPress={() => moveDay(idx, -1)} disabled={idx === 0} style={MOVE_UP} className={idx === 0 ? 'opacity-20' : 'active:opacity-60'}>
                  <ChevronUp size={16} color={colors.txMuted} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={t('programs.form.daysEditor.moveDownNumbered', { number: idx + 1 })} onPress={() => moveDay(idx, 1)} disabled={idx === days.length - 1} style={MOVE_DOWN} className={idx === days.length - 1 ? 'opacity-20' : 'active:opacity-60'}>
                  <ChevronDown size={16} color={colors.txMuted} />
                </Pressable>
              </View>

              <View className={`h-8 w-8 items-center justify-center rounded-lg ${day.is_rest_day ? 'bg-surface-muted' : 'bg-brand-500/15'}`}>
                {day.is_rest_day ? <Moon size={16} color={colors.txMuted} /> : <Dumbbell size={16} color={accent} />}
              </View>

              <View className="flex-1">
                <Field
                  value={day.name}
                  onChangeText={(text) => updateDay(idx, { name: text })}
                  placeholder={day.is_rest_day ? t('programs.form.daysEditor.restPlaceholder', { number: idx + 1 }) : t('programs.day.numbered', { number: idx + 1 })}
                />
              </View>

              <IconButton icon={Trash2} label={t('programs.form.daysEditor.remove')} variant="ghost" size="sm" onPress={() => removeDay(idx)} />
            </View>

            <View className="px-3 pb-3">
              <SegmentedControl
                size="sm"
                options={[{ value: 'workout', label: t('programs.form.daysEditor.workout') }, { value: 'rest', label: t('programs.form.daysEditor.rest') }] as const}
                value={day.is_rest_day ? 'rest' : 'workout'}
                onChange={(v) => setDayType(idx, v === 'rest')}
              />
            </View>

            {!day.is_rest_day && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setExpanded(isOpen ? null : idx)}
                className={`flex-row items-center justify-between border-t border-surface-border/60 px-3 py-2.5 active:bg-surface-muted/40 ${interactive('hover:bg-surface-muted/40', { inset: true })}`}
              >
                <AppText variant="caption" color="muted">
                  {t('common.count.exercises', { count: day.exercises.length })}
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
          style={ADD_DAY}
          className="flex-1 active:scale-95"
        >
          <View className="flex-row items-center justify-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/10 py-2.5">
            <Plus size={14} color={accent} />
            <AppText variant="label" style={{ color: accent }}>{t('programs.form.daysEditor.addWorkoutDay')}</AppText>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => addDay(true)}
          style={ADD_DAY}
          className="flex-1 active:scale-95"
        >
          <View className="flex-row items-center justify-center gap-1.5 rounded-lg border border-surface-border bg-surface-muted py-2.5">
            <Moon size={14} color={colors.txMuted} />
            <AppText variant="label" color="secondary">{t('programs.form.daysEditor.addRestDay')}</AppText>
          </View>
        </Pressable>
      </View>
    </View>
  )
}

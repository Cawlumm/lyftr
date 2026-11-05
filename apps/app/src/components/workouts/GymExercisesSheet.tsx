import { useId, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions, type ScrollViewInstance } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { ArrowUpDown, CheckCircle2, Circle, CircleDot } from '../ui/icons'
import { AppText, Sheet, SheetButton } from '../ui'
import { currentStep, interactive } from '../ui/interaction'
import { useTheme } from '../../theme/useTheme'
import { ReorderList } from './ReorderExercisesSheet'

export type ExercisesSheetMode = 'list' | 'reorder'

export interface ExerciseProgress {
  name: string
  /** Completed sets. */
  done: number
  /** All sets. */
  total: number
}

export type RowStatus = 'current' | 'done' | 'upcoming'

/** The one being worked is "current" even once its sets are all done: that is where you are. */
export const rowStatus = (i: number, current: number, e: ExerciseProgress): RowStatus =>
  i === current ? 'current' : e.total > 0 && e.done === e.total ? 'done' : 'upcoming'

const ROW_LABEL = {
  current: 'gym.exercises.rowCurrent',
  done: 'gym.exercises.rowDone',
  upcoming: 'gym.exercises.rowUpcoming',
} as const

// Same height and gap as a reorder row, so switching views does not move the rows.
const ROW_H = 52
const GAP = 6

interface Props {
  /** The view it opens on; null while closed. */
  open: ExercisesSheetMode | null
  exercises: ExerciseProgress[]
  /** One stable key per row (occurrenceKeys). */
  rowKeys: string[]
  /** Index of the exercise being worked. */
  current: number
  onJump: (index: number) => void
  onMove: (from: number, to: number) => void
  onClose: () => void
}

// Gym Mode's exercise list, opened from the progress chip in the top bar: where you are, what
// is done, and a tap to go anywhere else. Its Reorder button turns the same sheet into the
// reorder list (the iOS Edit/Done idiom), so reordering is one path from every phase; the
// overview's reorder icon opens it straight on that view, and there Done closes it.
export function GymExercisesSheet({ open, ...rest }: Props) {
  const titleId = useId()
  return (
    <Sheet open={open !== null} onClose={rest.onClose} labelledBy={titleId} width="sm">
      {/* Mounted per open, so each one starts on the view it was opened for. */}
      {open ? <Body initial={open} titleId={titleId} {...rest} /> : null}
    </Sheet>
  )
}

function Body({
  initial, titleId, exercises, rowKeys, current, onJump, onMove, onClose,
}: Omit<Props, 'open'> & { initial: ExercisesSheetMode; titleId: string }) {
  const { t } = useTranslation()
  const { colors, accent } = useTheme()
  const { height } = useWindowDimensions()
  const [mode, setMode] = useState(initial)
  const reorder = mode === 'reorder'
  const scrolled = useRef(false)
  const scrollRef = useRef<ScrollViewInstance>(null)

  // One button that stays put and changes its word, so keyboard focus stays on it.
  const toggle = () => {
    if (!reorder) setMode('reorder')
    else if (initial === 'reorder') onClose()
    else {
      // The list remounts at the top: put it back on the exercise being worked, which a
      // reorder may have moved.
      scrolled.current = false
      setMode('list')
    }
  }

  return (
    <View className="px-6">
      <View className="mb-3 flex-row items-center gap-3">
        <AppText nativeID={titleId} variant="heading" numberOfLines={1} className="flex-1">
          {reorder ? t('workouts.reorder.title') : t('gym.exercises.title')}
        </AppText>
        {exercises.length > 1 ? (
          <Pressable
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={reorder ? t('common.done') : t('workouts.reorder.title')}
            className={`h-11 flex-row items-center gap-1.5 rounded-xl px-4 active:scale-95 ${reorder ? 'bg-brand-500' : 'border border-surface-border bg-surface-muted'} ${interactive(reorder ? 'hover:bg-brand-600' : 'hover:bg-surface-border')}`}
          >
            {reorder ? null : <ArrowUpDown size={14} color={colors.txSecondary} />}
            <Text className={`font-sans-semibold text-sm ${reorder ? 'text-white' : 'text-tx-secondary'}`} numberOfLines={1}>
              {reorder ? t('common.done') : t('workouts.reorder.button')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {reorder ? (
        <>
          <AppText variant="caption" color="muted" className="mb-3">{t('workouts.reorder.hint')}</AppText>
          <ReorderList names={exercises.map((e) => e.name)} rowKeys={rowKeys} onMove={onMove} />
        </>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            testID="gym-exercises-list"
            style={{ maxHeight: Math.max((ROW_H + GAP) * 3, height * 0.55) }}
            // A long workout opens on the exercise being worked, with the one before it showing.
            onLayout={() => {
              if (scrolled.current) return
              scrolled.current = true
              if (current > 1) scrollRef.current?.scrollTo({ y: (current - 1) * (ROW_H + GAP), animated: false })
            }}
            showsVerticalScrollIndicator={false}
          >
            {exercises.map((e, i) => {
              const status = rowStatus(i, current, e)
              const here = status === 'current'
              const sets = t('workouts.active.setsDone', { done: e.done, count: e.total })
              return (
                <Pressable
                  key={rowKeys[i]}
                  testID={`gym-exercise-row-${i}`}
                  onPress={() => onJump(i)}
                  accessibilityRole="button"
                  accessibilityLabel={t(ROW_LABEL[status], { number: i + 1, name: e.name, sets })}
                  {...currentStep(here)}
                  style={{ height: ROW_H, marginBottom: GAP }}
                  className={`flex-row items-center gap-3 rounded-xl border px-3 active:opacity-70 ${here ? 'border-brand-500/50 bg-brand-500/10' : 'border-surface-border bg-surface-muted'} ${interactive(here ? 'hover:bg-brand-500/20' : 'hover:bg-surface-border', { inset: true })}`}
                >
                  <Text className="font-sans-bold text-sm" style={{ color: here ? accent : colors.txMuted, fontVariant: ['tabular-nums'], minWidth: 18 }}>{i + 1}</Text>
                  <AppText variant={here ? 'bodySemibold' : 'body'} numberOfLines={1} className="flex-1">{e.name}</AppText>
                  <AppText variant="caption" color="muted" style={{ fontVariant: ['tabular-nums'] }}>{`${e.done}/${e.total}`}</AppText>
                  {status === 'done' ? <CheckCircle2 size={18} color={accent} />
                    : here ? <CircleDot size={18} color={accent} />
                      : <Circle size={18} color={colors.txMuted} />}
                </Pressable>
              )
            })}
          </ScrollView>
          <View className="mt-3">
            <SheetButton label={t('common.close')} variant="muted" onPress={onClose} />
          </View>
        </>
      )}
    </View>
  )
}

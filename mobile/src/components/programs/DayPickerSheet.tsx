import { ScrollView, View } from 'react-native'
import { Dumbbell } from 'lucide-react-native'
import type { Program, ProgramDay } from '@lyftr/shared'
import { workoutDays, dayLabel } from '@lyftr/shared'
import { AppText, ListRow, Sheet } from '../ui'
import { useTheme } from '../../theme/useTheme'

interface Props {
  /** The program to pick a day from; sheet is closed when null. */
  program: Program | null
  onSelect: (program: Program, day: ProgramDay) => void
  onClose: () => void
}

// Given a program the user just tapped, either resolve straight to its one workout
// day (skip the sheet entirely — keeps the single-day-program flow a one-tap action,
// same as before the multi-day rework) or hand it to `openSheet` so DayPickerSheet
// can ask which day. For a program with zero workout days (nothing to load), defers
// to `onEmpty` if given — web parity: navigate somewhere rather than a dead tap.
export function pickProgramDay(
  program: Program,
  onSelect: (program: Program, day: ProgramDay) => void,
  openSheet: (program: Program) => void,
  onEmpty?: () => void
) {
  const days = workoutDays(program)
  if (days.length === 0) { onEmpty?.(); return }
  if (days.length === 1) { onSelect(program, days[0]); return }
  openSheet(program)
}

// Bottom sheet listing a program's workout days (rest days excluded — nothing to
// load from them) so the caller can pick which one to start/load. Only ever shown
// when pickProgramDay() determined the program has more than one workout day.
export function DayPickerSheet({ program, onSelect, onClose }: Props) {
  const { accent } = useTheme()
  if (!program) return null
  const days = workoutDays(program)
  const todayId = (program.days ?? [])[program.current_day_index]?.id

  return (
    <Sheet open onClose={onClose} haptic="selection">
      <View className="px-6">
        <View className="items-center pb-4">
          <AppText variant="label" color="muted" className="uppercase" style={{ letterSpacing: 1.5 }}>
            {program.name}
          </AppText>
          <AppText variant="heading" className="mt-0.5">Pick a Day</AppText>
        </View>
        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
          {days.map((day, i) => (
            <ListRow
              key={day.id ?? i}
              primary={
                <View className="flex-row items-center gap-2">
                  <AppText variant="bodySemibold">{dayLabel(day, day.order_index)}</AppText>
                  {day.id === todayId ? (
                    <View className="rounded-full bg-brand-500/15 px-1.5 py-0.5">
                      <AppText variant="caption" style={{ color: accent }}>TODAY</AppText>
                    </View>
                  ) : null}
                </View>
              }
              secondary={`${(day.exercises ?? []).length} exercises`}
              right={<Dumbbell size={16} color={accent} />}
              onPress={() => onSelect(program, day)}
            />
          ))}
        </ScrollView>
      </View>
    </Sheet>
  )
}

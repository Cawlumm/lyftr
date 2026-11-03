import { View } from 'react-native'
import { CalendarDays } from '../ui/icons'
import { AppText } from '../ui'
import { DateInput } from '../ui/DateInput.web'
import { useTheme } from '../../theme/useTheme'
import type { DayPillProps } from './DayPill'

// Web: the pill is DateInput.web's face, so the transparent <input type=date> lies over it
// and its keyboard focus ring is drawn on the pill. The native overlay at opacity 0 would
// hide that ring along with the field.
export function DayPill({ dayLabel, yearLabel, value, onChange }: DayPillProps) {
  const { colors } = useTheme()
  return (
    <DateInput value={value} onChange={onChange} maximumDate={new Date()}>
      <View className="flex-row items-center justify-center gap-2 rounded-xl bg-surface-muted py-2.5">
        <CalendarDays size={16} color={colors.txMuted} />
        <AppText variant="bodySemibold" style={{ fontSize: 14 }}>{dayLabel}</AppText>
        {yearLabel ? <AppText variant="caption" color="muted">{yearLabel}</AppText> : null}
      </View>
    </DateInput>
  )
}

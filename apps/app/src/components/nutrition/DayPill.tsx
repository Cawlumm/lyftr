import { View } from 'react-native'
import { CalendarDays } from '../ui/icons'
import { AppText, DateInput } from '../ui'
import { useTheme } from '../../theme/useTheme'

export interface DayPillProps {
  dayLabel: string
  yearLabel?: string
  value: string
  onChange: (v: string) => void
}

// The date-navigator center: a tappable pill showing the day label; tapping opens the
// platform date picker (via the shared DateInput's own picker). We hide DateInput's
// default field look and render our own pill so the label logic (Today/Yesterday/date)
// matches web while still using the vetted picker + max-date behavior.
export function DayPill({ dayLabel, yearLabel, value, onChange }: DayPillProps) {
  const { colors } = useTheme()
  return (
    <View>
      {/* Visible pill */}
      <View pointerEvents="none" className="flex-row items-center justify-center gap-2 rounded-xl bg-surface-muted py-2.5">
        <CalendarDays size={16} color={colors.txMuted} />
        <AppText variant="bodySemibold" style={{ fontSize: 14 }}>{dayLabel}</AppText>
        {yearLabel ? <AppText variant="caption" color="muted">{yearLabel}</AppText> : null}
      </View>
      {/* Transparent picker overlay filling the pill */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}>
        <DateInput value={value} onChange={onChange} maximumDate={new Date()} />
      </View>
    </View>
  )
}

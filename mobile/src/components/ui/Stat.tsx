import { Text, View } from 'react-native'
import { AppText } from './Typography'

interface Props {
  label: string
  value: string | number
  unit?: string
  /** Tiny third line, e.g. the "/ 150g" goal under a macro. */
  sublabel?: string
  /** Prefix positive numeric values with "+" (deltas like 7d/30d change). */
  signed?: boolean
  className?: string
}

// Mobile-only extraction unifying the dashboard's Macro and the weight screen's Stat:
// a centered value (+ optional inline unit), a label, and an optional sub-line.
// Intended for row layouts (`flex-row justify-between` of several Stats).
export function Stat({ label, value, unit, sublabel, signed = false, className = '' }: Props) {
  const display = signed && typeof value === 'number' && value >= 0 ? `+${value}` : String(value)
  return (
    <View className={`items-center ${className}`}>
      <Text
        className="font-display text-lg text-tx-primary"
        // Tabular digits so a row of Stats doesn't wobble as values update.
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {display}
        {unit ? <Text className="font-sans text-sm text-tx-muted"> {unit}</Text> : null}
      </Text>
      <AppText variant="caption">{label}</AppText>
      {sublabel ? (
        <Text className="font-sans text-[10px] text-tx-muted">{sublabel}</Text>
      ) : null}
    </View>
  )
}

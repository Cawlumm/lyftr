import { Pressable, Text, TextInput, View } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'

// A thumb-friendly duration input: one unified stepper — −/+ as integrated end
// segments (±5 min) around a still-typeable value with a "min" suffix. Common
// durations are a tap or two and no keyboard; an exact value is one tap-to-type away.
// Value + onChange are whole MINUTES (same as the form's formData.duration), so the
// payload upstream is unchanged.
const STEP = 5

export function DurationField({ value, onChange, inputAccessoryViewID }: {
  value: number
  onChange: (minutes: number) => void
  inputAccessoryViewID?: string
}) {
  const { colors, accent } = useTheme()
  const step = (delta: number) => onChange(Math.max(0, value + delta))
  const canDec = value > 0

  return (
    <View className="h-12 flex-row items-stretch overflow-hidden rounded-xl border border-surface-border bg-surface-overlay">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease duration"
        onPress={() => step(-STEP)}
        disabled={!canDec}
        className={`w-11 items-center justify-center border-r border-surface-border active:bg-surface-muted ${canDec ? '' : 'opacity-40'}`}
      >
        <Minus size={18} color={canDec ? accent : colors.txMuted} strokeWidth={2.4} />
      </Pressable>

      <View className="flex-1 flex-row items-center justify-center">
        <TextInput
          value={value ? String(value) : ''}
          onChangeText={(t) => onChange(Number(t.replace(/[^0-9]/g, '')) || 0)}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          inputAccessoryViewID={inputAccessoryViewID}
          placeholder="0"
          placeholderTextColor={colors.txMuted}
          accessibilityLabel="Duration in minutes"
          // maxWidth keeps the web <input> from claiming a wide default size (which
          // would drift the value away from "min"); text-right sits it next to the label.
          className="py-0 text-right font-sans-bold text-base text-tx-primary"
          style={{ fontVariant: ['tabular-nums'], minWidth: 22, maxWidth: 56 }}
        />
        <Text className="ml-1 font-sans text-sm text-tx-muted">min</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase duration"
        onPress={() => step(STEP)}
        className="w-11 items-center justify-center border-l border-surface-border active:bg-surface-muted"
      >
        <Plus size={18} color={accent} strokeWidth={2.4} />
      </Pressable>
    </View>
  )
}

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
        className={`w-8 items-center justify-center border-r border-surface-border active:bg-surface-muted ${canDec ? '' : 'opacity-40'}`}
      >
        <Minus size={16} color={canDec ? accent : colors.txMuted} strokeWidth={2.4} />
      </Pressable>

      {/* The value + "min" read as one group. They live in an auto-height inner block
          that BASELINE-aligns them (items-baseline), and that block is centered in the
          field (items-center on the column). Baseline-locking is the fix for the load-in
          jump: "min" is pinned to the number's text baseline, so even if iOS re-measures
          the input a frame late and the block re-centers, the two move together instead
          of "min" drifting relative to the number. Height is left to h-12 (stretched from
          the row) — an inline `height` here doesn't merge cleanly with NativeWind on native
          and let the box grow past 48 on iOS. */}
      <View className="h-12 flex-1 items-center justify-center">
        <View className="flex-row items-baseline">
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
            className="py-0 text-center text-base text-tx-primary"
            // fontFamily inline (not via className) so the input never renders one frame
            // in the system fallback font before the brand font resolves. lineHeight +
            // includeFontPadding bound the input's line box — without them iOS gives a
            // bare TextInput extra intrinsic height, which (via items-baseline) makes the
            // whole control render taller than the 48pt box and out-of-line with DateInput.
            style={{ fontFamily: 'PlusJakartaSans_700Bold', fontVariant: ['tabular-nums'], minWidth: 14, maxWidth: 40, lineHeight: 20, includeFontPadding: false }}
          />
          <Text
            className="ml-0.5 text-xs text-tx-muted"
            style={{ fontFamily: 'PlusJakartaSans_500Medium', includeFontPadding: false }}
          >
            min
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase duration"
        onPress={() => step(STEP)}
        className="w-8 items-center justify-center border-l border-surface-border active:bg-surface-muted"
      >
        <Plus size={16} color={accent} strokeWidth={2.4} />
      </Pressable>
    </View>
  )
}

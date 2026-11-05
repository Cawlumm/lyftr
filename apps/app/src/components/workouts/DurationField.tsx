import { Platform, Pressable, Text, TextInput, View, type TextStyle } from 'react-native'
import { Minus, Plus } from '../ui/icons'
import { sanitizeNumericInput, useTranslation } from '@lyftr/shared'
import { NO_INPUT_OUTLINE, TOUCH_MIN, touchTarget } from '../ui/interaction'
import { useTheme } from '../../theme/useTheme'

// A thumb-friendly duration input: one unified stepper — −/+ as integrated end
// segments (±5 min) around a still-typeable value with a "min" suffix. Common
// durations are a tap or two and no keyboard; an exact value is one tap-to-type away.
// Value + onChange are whole MINUTES (same as the form's formData.duration), so the
// payload upstream is unchanged.
const STEP = 5

// The segments are 32px wide and flush with the field's edge, and the value in the middle needs
// every pixel between them, so they take their extra width outward, past the field's border.
const GROW = TOUCH_MIN - 32
const STEP_MINUS = { width: TOUCH_MIN, marginLeft: -GROW, alignItems: 'flex-end' } as const
const STEP_PLUS = { width: TOUCH_MIN, marginRight: -GROW, alignItems: 'flex-start' } as const

export function DurationField({ value, onChange, inputAccessoryViewID }: {
  value: number
  onChange: (minutes: number) => void
  inputAccessoryViewID?: string
}) {
  const { t } = useTranslation()
  const { colors, accent } = useTheme()
  const step = (delta: number) => onChange(Math.max(0, value + delta))
  const canDec = value > 0
  const minusHit = touchTarget(32, 48, { disabled: !canDec, inset: true })
  const plusHit = touchTarget(32, 48, { inset: true })

  return (
    <View className="h-12 flex-row items-stretch rounded-xl border border-surface-border bg-surface-overlay">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('workouts.form.durationField.decrease')}
        onPress={() => step(-STEP)}
        disabled={!canDec}
        style={STEP_MINUS}
        className={`${minusHit.outer} ${canDec ? '' : 'opacity-40'}`}
      >
        <View className={`h-full w-8 items-center justify-center rounded-l-xl border-r border-surface-border group-active/hit:bg-surface-muted ${minusHit.inner}`}>
          <Minus size={16} color={canDec ? accent : colors.txMuted} strokeWidth={2.4} />
        </View>
      </Pressable>

      {/* The value + "min" read as one group. They live in an auto-height inner block
          that BASELINE-aligns them (items-baseline), and that block is centered in the
          field (items-center on the column). Baseline-locking is the fix for the load-in
          jump: "min" is pinned to the number's text baseline, so even if iOS re-measures
          the input a frame late and the block re-centers, the two move together instead
          of "min" drifting relative to the number. Height is left to h-12 (stretched from
          the row) — an inline `height` here doesn't merge cleanly with NativeWind on native
          and let the box grow past 48 on iOS. */}
      <View className={`h-12 flex-1 items-center justify-center ${Platform.OS === 'web' ? 'rounded-lg focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-focus' : ''}`}>
        <View className="flex-row items-baseline">
          <TextInput
            value={value ? String(value) : ''}
            onChangeText={(text) => onChange(Number(sanitizeNumericInput(text, 'numeric')) || 0)}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            inputAccessoryViewID={inputAccessoryViewID}
            placeholder="0"
            placeholderTextColor={colors.txMuted}
            accessibilityLabel={t('workouts.form.durationField.inputLabel')}
            className="py-0 text-center text-base text-tx-primary"
            // fontFamily inline (not via className) so the input never renders one frame
            // in the system fallback font before the brand font resolves. lineHeight +
            // includeFontPadding bound the input's line box — without them iOS gives a
            // bare TextInput extra intrinsic height, which (via items-baseline) makes the
            // whole control render taller than the 48pt box and out-of-line with DateInput.
            // A web <input> does not size to its text: it took maxWidth, which pushed "min"
            // into the + segment on a narrow field. One ch per digit is its width.
            style={[
              { fontFamily: 'PlusJakartaSans_700Bold', fontVariant: ['tabular-nums'], minWidth: 14, maxWidth: 40, lineHeight: 20, includeFontPadding: false },
              Platform.OS === 'web' ? ({ width: `${Math.max(String(value || '').length, 1)}ch` } as unknown as TextStyle) : null,
              NO_INPUT_OUTLINE,
            ]}
          />
          <Text
            className="ml-0.5 text-xs text-tx-muted"
            style={{ fontFamily: 'PlusJakartaSans_500Medium', includeFontPadding: false }}
          >
            {t('workouts.form.durationField.unit')}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('workouts.form.durationField.increase')}
        onPress={() => step(STEP)}
        style={STEP_PLUS}
        className={plusHit.outer}
      >
        <View className={`h-full w-8 items-center justify-center rounded-r-xl border-l border-surface-border group-active/hit:bg-surface-muted ${plusHit.inner}`}>
          <Plus size={16} color={accent} strokeWidth={2.4} />
        </View>
      </Pressable>
    </View>
  )
}

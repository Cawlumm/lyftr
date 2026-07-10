import type { ReactNode } from 'react'
import { Text, TextInput, TextInputProps, View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated'
import { useTheme } from '../../theme/useTheme'
import { Label } from './Typography'

interface Props extends TextInputProps {
  label?: string
  error?: string | null
  className?: string
  /** Optional leading glyph inside the box (e.g. a search icon). */
  leftIcon?: LucideIcon
  /** Optional trailing element inside the box (e.g. a spinner or clear button). */
  rightSlot?: ReactNode
}

// Labeled text field, mirrors the web `.input` + `.label` pattern, with a focus
// glow on the box.
//
// Focus styling runs through a Reanimated shared value, NOT React state: on the New
// Architecture (Fabric), a re-render fired from a TextInput's own onFocus immediately
// re-blurs the input (keyboard flashes up, then dismisses). Same fix as authui's
// IconInput — any focus-reactive input must follow it. The animated border lives on a
// wrapper (inline styles: animation-driven values are a documented className
// exception), so `className` applies to the outer container for layout tweaks.
//
// `multiline` is the web `textarea min-h-20 resize-none` analog: taller floor,
// top-aligned input, same UI-thread focus glow.
export function Field({ label, error, className = '', leftIcon: LeftIcon, rightSlot, onFocus, onBlur, multiline, ...rest }: Props) {
  const { colors, brand } = useTheme()
  const focus = useSharedValue(0)
  const boxStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? brand.error
      : interpolateColor(focus.value, [0, 1], [colors.border, brand.cyan]),
  }))
  return (
    <View className={`gap-1.5 ${className}`}>
      {label ? <Label>{label}</Label> : null}
      <Reanimated.View
        style={[
          {
            minHeight: multiline ? 80 : 48,
            borderRadius: 8,
            borderWidth: 1,
            paddingHorizontal: 14,
            paddingVertical: multiline ? 10 : 0,
            backgroundColor: colors.overlay,
            flexDirection: 'row',
            alignItems: multiline ? 'flex-start' : 'center',
          },
          boxStyle,
        ]}
      >
        {LeftIcon ? <LeftIcon size={18} color={colors.txMuted} style={{ marginRight: 8 }} /> : null}
        <TextInput
          className="flex-1 font-sans text-tx-primary"
          // fontSize inline instead of the `text-base` class so NO lineHeight is imposed:
          // on iOS a single-line TextInput with a set lineHeight top-aligns its text and
          // clips descenders (g, j, p, y). Natural line metrics render them in full.
          // Single-line gets an explicit `height` (not padding): a single-line TextInput
          // vertically CENTERS its text within its frame (iOS always; browsers/RN-web via
          // the native <input>), so a frame taller than the glyph box centres the text AND
          // leaves room for descenders. Using paddingVertical instead top-aligned the text
          // (frame == line box + pad pushed from the top) — it rode too high in the box.
          style={multiline ? { fontSize: 16, minHeight: 60, textAlignVertical: 'top' } : { fontSize: 16, height: 46 }}
          multiline={multiline}
          placeholderTextColor={colors.txMuted}
          onFocus={(e) => {
            focus.value = withTiming(1, { duration: 150 })
            onFocus?.(e)
          }}
          onBlur={(e) => {
            focus.value = withTiming(0, { duration: 150 })
            onBlur?.(e)
          }}
          {...rest}
        />
        {rightSlot ? <View style={{ marginLeft: 8 }}>{rightSlot}</View> : null}
      </Reanimated.View>
      {error ? <Text className="font-sans text-xs text-error-400">{error}</Text> : null}
    </View>
  )
}

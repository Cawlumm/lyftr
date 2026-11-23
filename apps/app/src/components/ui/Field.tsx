import { useCallback, useLayoutEffect, useRef, type ReactNode, type Ref } from 'react'
import { Platform, TextInput, TextInputProps, View, type TextInputInstance } from 'react-native'
import { FIELD_FOCUS_RING, NO_INPUT_OUTLINE, WEB_REQUIRED } from './interaction'
import type { LucideIcon } from './icons'
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated'
import { useTheme } from '../../theme/useTheme'
import { AppText, Label } from './Typography'

interface Props extends TextInputProps {
  label?: string
  error?: string | null
  className?: string
  /** Optional leading glyph inside the box (e.g. a search icon). */
  leftIcon?: LucideIcon
  /** Optional trailing element inside the box (e.g. a spinner or clear button). */
  rightSlot?: ReactNode
  /** Below the box and its error, e.g. suggestions for what was typed. */
  footer?: ReactNode
  ref?: Ref<TextInputInstance>
  /** Must be filled: aria-required on web. The visible "*", where a form shows one, is FieldHeader's or StepperTile's. */
  required?: boolean
  /** One line tall, growing a line at a time as the text wraps, for a short entry that can
   *  run long (a step of instructions). Return still submits: pair it with submitBehavior. */
  wrap?: boolean
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
const WRAP_LINE = 24

export function Field({ label, error, className = '', leftIcon: LeftIcon, rightSlot, footer, onFocus, onBlur, multiline, required, wrap, ref, ...rest }: Props) {
  const { colors, brand } = useTheme()
  // A wrapping field sizes itself to its text. Native grows and shrinks on its own; a web textarea
  // does neither, and its scrollHeight never drops below the height it was given, so it is reset
  // and measured again whenever the text (or the placeholder it shows) changes.
  const own = useRef<TextInputInstance | null>(null)
  const setRef = useCallback((el: TextInputInstance | null) => {
    own.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as { current: TextInputInstance | null }).current = el
  }, [ref])
  useLayoutEffect(() => {
    if (!wrap || Platform.OS !== 'web') return
    const node = own.current as unknown as HTMLTextAreaElement | null
    if (!node?.style) return
    node.style.height = 'auto'
    node.style.height = `${Math.max(WRAP_LINE, node.scrollHeight)}px`
  })
  const focus = useSharedValue(0)
  const boxStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? brand.error
      : interpolateColor(focus.value, [0, 1], [colors.border, brand.cyan]),
  }))
  // An error already draws the box in the error colour: a focus ring beside it would be a second outline.
  return (
    <View className={`gap-1.5 ${className}`}>
      {label ? <Label>{label}</Label> : null}
      <View className={error ? '' : FIELD_FOCUS_RING} style={{ borderRadius: 8 }}>
      <Reanimated.View
        style={[
          {
            minHeight: multiline ? 80 : 48,
            borderRadius: 8,
            borderWidth: 1,
            paddingHorizontal: 14,
            paddingVertical: multiline ? 10 : wrap ? 11 : 0,
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
          style={[
            multiline ? { fontSize: 16, minHeight: 60, textAlignVertical: 'top' }
              : wrap ? { fontSize: 16, lineHeight: 22, paddingVertical: 0, textAlignVertical: 'center', minHeight: WRAP_LINE }
              : { fontSize: 16, height: 46 },
            NO_INPUT_OUTLINE,
          ]}
          multiline={multiline || wrap}
          // rows=1 on the web (react-native-web maps numberOfLines to rows; a textarea defaults to
          // two), so a short step measures one line. Never on native: Android would cap the lines.
          {...(wrap && Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
          ref={setRef}
          accessibilityLabel={label}
          placeholderTextColor={colors.txMuted}
          onFocus={(e) => {
            focus.value = withTiming(1, { duration: 150 })
            onFocus?.(e)
          }}
          onBlur={(e) => {
            focus.value = withTiming(0, { duration: 150 })
            onBlur?.(e)
          }}
          {...(required ? WEB_REQUIRED : {})}
          {...rest}
        />
        {rightSlot ? <View style={{ marginLeft: 8 }}>{rightSlot}</View> : null}
      </Reanimated.View>
      </View>
      {error ? <AppText variant="caption" color="error">{error}</AppText> : null}
      {footer}
    </View>
  )
}

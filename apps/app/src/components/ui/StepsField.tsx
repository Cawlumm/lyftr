import { useEffect, useRef } from 'react'
import { Pressable, View, type TextInputInstance } from 'react-native'
import { instructionSteps } from '@lyftr/shared'
import { Plus, X } from './icons'
import { AppText } from './Typography'
import { Field } from './Field'
import { useFormKeyboardId } from './FormPage'
import { IconButton } from './IconButton'
import { Icon } from './Icon'
import { useTheme } from '../../theme/useTheme'
import { interactive, TOUCH_MIN } from './interaction'

export interface StepsFieldLabels {
  placeholderFirst: string
  placeholderNext: string
  add: string
  step: (number: number) => string
  remove: (number: number) => string
}

interface Props {
  /** One entry per step; empty ones are the caller's to drop on save. */
  value: string[]
  onChange: (steps: string[]) => void
  labels: StepsFieldLabels
  max?: number
  /** Shown under the steps (the form's validator owns the length rules: an input-level maxLength
   *  would cut a pasted list of steps short before it could be split). */
  error?: string
}

// A numbered list of single-line inputs. Return adds the next step and moves to it, Backspace on
// an empty one removes it and goes back, and pasted text with line breaks becomes one step per
// line. Always at least one step, so there is somewhere to type.
export function StepsField({ value, onChange, labels, max = 30, error }: Props) {
  const steps = value.length > 0 ? value : ['']
  const inputs = useRef<(TextInputInstance | null)[]>([])
  const focusAfter = useRef<number | null>(null)
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const doneId = useFormKeyboardId()
  const { accent } = useTheme()

  useEffect(() => {
    if (focusAfter.current === null) return
    const i = focusAfter.current
    focusAfter.current = null
    // Shortly after, not in this commit: Android focuses an input that has only just mounted
    // without raising the keyboard (Add step with the keyboard down: the step looked ready but
    // nothing could be typed). A frame was not enough on the emulator; 50ms was. A re-render in
    // between must not cancel it, so only a newer request or unmounting does.
    clearTimeout(focusTimer.current)
    focusTimer.current = setTimeout(() => inputs.current[i]?.focus(), 50)
  })
  useEffect(() => () => clearTimeout(focusTimer.current), [])

  const set = (next: string[], focus?: number) => {
    focusAfter.current = focus ?? null
    onChange(next)
  }
  const edit = (i: number, text: string) => {
    if (!/[\r\n]/.test(text)) {
      set(steps.map((s, j) => (j === i ? text : s)))
      return
    }
    const lines = instructionSteps(text.replace(/\r/g, '\n'))
    if (lines.length === 0) { set(steps.map((s, j) => (j === i ? '' : s))); return }
    const next = [...steps.slice(0, i), ...lines, ...steps.slice(i + 1)].slice(0, max)
    set(next, Math.min(i + lines.length - 1, next.length - 1))
  }
  const insertAfter = (i: number) => {
    if (steps.length >= max) return
    set([...steps.slice(0, i + 1), '', ...steps.slice(i + 1)], i + 1)
  }
  // Backspace on an empty step goes back to the one before; the × leaves the keyboard alone.
  const remove = (i: number, focusPrevious: boolean) => {
    if (steps.length === 1) { set(['']); return }
    set(steps.filter((_, j) => j !== i), focusPrevious ? Math.max(0, i - 1) : undefined)
  }
  const atCap = steps.length >= max

  return (
    <View className="gap-2">
      {/* pr-1.5 on each row: the ×'s 44px tap area reaches 6px past its icon box; at the form's
          edge the scroll view would clip that strip, leaving a tap there to land on nothing. */}
      {steps.map((s, i) => (
        <View key={i} className="flex-row items-center gap-2 pr-1.5">
          <AppText variant="bodySemibold" color="muted" className="w-6 text-right">{i + 1}.</AppText>
          <Field
            ref={(el) => { inputs.current[i] = el }}
            className="flex-1"
            accessibilityLabel={labels.step(i + 1)}
            value={s}
            onChangeText={(text) => edit(i, text)}
            placeholder={i === 0 ? labels.placeholderFirst : labels.placeholderNext}
            returnKeyType="next"
            inputAccessoryViewID={doneId}
            onSubmitEditing={() => insertAfter(i)}
            onKeyPress={(e) => {
              if (e.nativeEvent.key === 'Backspace' && s === '' && steps.length > 1) remove(i, true)
            }}
            {...pasteProps(s, (text) => edit(i, text))}
          />
          <IconButton icon={X} label={labels.remove(i + 1)} onPress={() => remove(i, false)} />
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={labels.add}
        accessibilityState={{ disabled: atCap }}
        disabled={atCap}
        onPress={() => insertAfter(steps.length - 1)}
        style={{ minHeight: TOUCH_MIN }}
        className={`flex-row items-center gap-1.5 self-start ${atCap ? 'opacity-40' : interactive('hover:opacity-80')}`}
      >
        <Icon icon={Plus} size="sm" color={accent} />
        <AppText variant="bodySemibold" color="brand">{labels.add}</AppText>
      </Pressable>
      {error ? <AppText variant="caption" color="error">{error}</AppText> : null}
    </View>
  )
}

// A browser's single-line input strips line breaks from a paste before onChangeText sees it, so
// on the web the clipboard is read first and put where the caret was, breaks intact, around what
// the step already held.
type PasteEvent = {
  clipboardData?: { getData: (t: string) => string }
  preventDefault?: () => void
  target?: { selectionStart?: number | null; selectionEnd?: number | null }
}
function pasteProps(current: string, onPaste: (text: string) => void) {
  return {
    onPaste: (e: PasteEvent) => {
      const text = e.clipboardData?.getData('text') ?? ''
      if (!/[\r\n]/.test(text)) return
      e.preventDefault?.()
      const start = e.target?.selectionStart ?? current.length
      const end = e.target?.selectionEnd ?? start
      onPaste(current.slice(0, start) + text + current.slice(end))
    },
  } as object
}

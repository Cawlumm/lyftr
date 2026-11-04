import { Platform } from 'react-native'

const RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus'

// Web-only pointer and keyboard states for the pressable primitives; native gets '' and
// keeps its own active: press feedback. Keyboard focus is focus-visible, never focus: or
// Pressable's `focused`, which also fire on a mouse click. `inset` draws the ring inside
// the box, for edge-to-edge rows whose container would clip one drawn outside.
export function interactive(hover: string, { disabled = false, inset = false } = {}): string {
  if (Platform.OS !== 'web') return ''
  if (disabled) return 'cursor-not-allowed'
  const offset = inset ? 'focus-visible:-outline-offset-2' : 'focus-visible:outline-offset-2'
  return `cursor-pointer ${RING} ${offset} ${hover}`
}

// These controls had no role, which native reads from the text alone; react-native-web needs
// one for the DOM, so web gets it and native is unchanged.
export const WEB_BUTTON = Platform.OS === 'web' ? ('button' as const) : undefined

// The aria-current of the step being worked; RN's types have no aria-current.
export const currentStep = (on: boolean) => (Platform.OS === 'web' ? { 'aria-current': on ? 'step' : undefined } : {}) as object

// A boxed text field: the ring is drawn on a plain wrapper that shares the box's radius (a
// Reanimated View takes no className on web) and the input's own square UA outline is off.
export const FIELD_FOCUS_RING = Platform.OS === 'web' ? 'focus-within:outline focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2' : ''
export const NO_INPUT_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as object

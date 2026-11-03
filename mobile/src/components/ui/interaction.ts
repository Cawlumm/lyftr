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

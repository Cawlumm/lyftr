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

// A tap lands on the pressable's own box: react-native-web ignores hitSlop, and native hit
// tests stop at a view's bounds. So a control smaller than TOUCH_MIN (Apple HIG 44pt, WCAG 2.2
// 2.5.5; Material asks 48dp) is padded out to it, and a negative margin of the same size gives
// the padding back to the layout, so nothing around it moves. The look then lives on an inner
// box, because a background on the padded pressable would grow with it. The pressable is the
// named group `hit` (a card's own `group` must not light it) and the inner box reads from it.
//
//   const hit = touchTarget(32, 32)
//   <Pressable className={hit.outer} style={hit.style}>
//     <View className={`h-8 w-8 rounded-lg group-hover/hit:bg-surface-muted ${hit.inner}`}>...</View>
//   </Pressable>
//
// The hover classes are written out at the call site, with the group prefix, so Tailwind can see
// them. Only for a box that stands alone; two targets closer than TOUCH_MIN overlap and a tap
// between them is ambiguous (e2e/touch-targets.spec.ts fails on that), so those get spacing.
export const TOUCH_MIN = 44

// The padding alone, for a control with no box of its own (a text link): the pressable is the
// whole look, so there is no inner box to move it to.
export function touchPad(width: number, height: number) {
  const x = Math.max(0, (TOUCH_MIN - width) / 2)
  const y = Math.max(0, (TOUCH_MIN - height) / 2)
  return { paddingHorizontal: x, paddingVertical: y, marginHorizontal: -x, marginVertical: -y }
}

const GROUP_RING = 'group-focus-visible/hit:outline group-focus-visible/hit:outline-2 group-focus-visible/hit:outline-focus'

export function touchTarget(width: number, height: number, { disabled = false, inset = false } = {}) {
  const web = Platform.OS === 'web'
  return {
    style: touchPad(width, height),
    // The pressable keeps the cursor and swallows the browser's own square outline; the inner
    // box draws the ring, so it follows the control's shape, not the padded one; `inset` draws it
    // inside, for a box that sits flush against its neighbour.
    // `group/hit` is on native too: the inner box's `group-active/hit:` press colour needs it.
    outer: `group/hit ${web ? `focus-visible:outline-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}` : ''}`,
    inner: web && !disabled ? `${GROUP_RING} ${inset ? 'group-focus-visible/hit:-outline-offset-2' : 'group-focus-visible/hit:outline-offset-2'}` : '',
  }
}

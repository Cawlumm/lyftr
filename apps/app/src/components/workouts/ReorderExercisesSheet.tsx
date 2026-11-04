import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo, Animated, Easing, PanResponder, Platform, Pressable, ScrollView, Text, View, useWindowDimensions,
  type GestureResponderEvent, type PressableInstance, type ScrollViewInstance, type ViewInstance,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { autoScrollSpeed, useTranslation } from '@lyftr/shared'
import { ArrowUpDown, ChevronDown, ChevronUp, GripVertical } from '../ui/icons'
import { AppText, IconButton, Sheet, SheetButton } from '../ui'
import { interactive } from '../ui/interaction'
import { useMotion } from '../../lib/useMotion'
import { useTheme } from '../../theme/useTheme'

// Every row is the same height, so a drag's target slot is its offset divided by the
// stride: no measuring, and the rows between source and target shift by exactly one stride.
const ROW_H = 52
const GAP = 6
const STRIDE = ROW_H + GAP

// Touch lifts a row after a short hold, so a swipe that starts on a row still scrolls the
// list; a finger that travels further than TOUCH_SLOP before then was scrolling. A mouse has
// no scroll to share the gesture with, so it lifts as soon as it moves MOUSE_SLOP.
const LIFT_DELAY = 220
const TOUCH_SLOP = 8
const MOUSE_SLOP = 4
const LIFT_SCALE = 1.03

/** The slot a row dragged `offset` px from slot `from` lands in, clamped to the list. */
export const dragTarget = (from: number, offset: number, count: number) =>
  Math.max(0, Math.min(count - 1, from + Math.round(offset / STRIDE)))

/** Where row `i` sits while the row at `from` is held over slot `to`: the rows between
 *  slide one stride toward the slot the held row left, which opens the gap it will drop in. */
export const shiftFor = (i: number, from: number, to: number) => {
  if (i === from) return 0
  if (from < to && i > from && i <= to) return -STRIDE
  if (to < from && i >= to && i < from) return STRIDE
  return 0
}

// Visually hidden but still read: the web half of the move announcement. react-native-web's
// AccessibilityInfo.announceForAccessibility is an empty function.
const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const

const nativeDriver = Platform.OS !== 'web'
const haptic = (fire: () => Promise<void>) => { if (Platform.OS !== 'web') fire().catch(() => {}) }

const LIFTED_SHADOW = Platform.select({
  web: { boxShadow: '0 10px 24px rgba(0,0,0,0.28)' },
  default: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
}) as object

interface Props {
  open: boolean
  /** Exercise names, in their current order. */
  names: string[]
  /** One stable key per row (occurrenceKeys), so a row keeps its identity as it moves. */
  rowKeys: string[]
  onMove: (from: number, to: number) => void
  onClose: () => void
}

type Drag = { from: number; to: number }

// Matched to the "Add exercise" button each one sits beside: the forms' small header
// buttons (`compact` where that button is py-2) and the running session's footer button.
const BUTTON_SIZE = {
  form: { box: 'rounded-lg px-3 py-2.5', text: 'text-xs', icon: 13 },
  compact: { box: 'rounded-lg px-3 py-2', text: 'text-xs', icon: 13 },
  footer: { box: 'rounded-2xl px-4 py-3.5', text: 'text-sm', icon: 16 },
} as const

/** The one way into the sheet, placed beside "Add exercise" on each screen; shown only once
 *  there are two exercises to put in order. `className` is for placement only. */
export function ReorderButton({ onPress, size = 'form', className = '' }: {
  onPress: () => void
  size?: keyof typeof BUTTON_SIZE
  className?: string
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const s = BUTTON_SIZE[size]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('workouts.reorder.title')}
      onPress={onPress}
      className={`flex-row items-center justify-center gap-1.5 border border-surface-border bg-surface-muted active:scale-95 ${s.box} ${interactive('hover:bg-surface-border')} ${className}`}
    >
      <ArrowUpDown size={s.icon} color={colors.txSecondary} />
      <Text className={`font-sans-semibold text-tx-secondary ${s.text}`} numberOfLines={1}>{t('workouts.reorder.button')}</Text>
    </Pressable>
  )
}

// Reorder as its own step, opened from one button beside "Add exercise", the way StrengthLog
// ("Reorder exercises") and Hevy (drag and drop from the exercise menu) do it: dragging a
// whole exercise card, set table and all, past other tall cards is the hard version of the
// same task. A row lifts from anywhere on it (a short hold on touch, so the list still
// scrolls), and the list scrolls itself near its edges. The up/down buttons are the
// single-pointer and keyboard path WCAG 2.5.7 asks a drag to have. Every move applies at
// once; Done just closes.
export function ReorderExercisesSheet({ open, names, rowKeys, onMove, onClose }: Props) {
  const { t } = useTranslation()
  const { colors, accent } = useTheme()
  const motion = useMotion()
  const { height } = useWindowDimensions()
  const titleId = useId()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // Web: the button pressed travels with its row, and the browser drops focus when React
  // moves a focused node. Put it back on the same control (or its twin at an edge).
  const buttons = useRef(new Map<string, PressableInstance | null>())
  const [refocus, setRefocus] = useState<string | null>(null)

  const count = names.length
  const latest = useRef({ names, rowKeys, count, onMove, motion })
  latest.current = { names, rowKeys, count, onMove, motion }

  // One translateY per row, by key, so a row's value travels with it when the order changes.
  const pos = useRef(new Map<string, Animated.Value>())
  const posFor = (key: string) => {
    let v = pos.current.get(key)
    if (!v) { v = new Animated.Value(0); pos.current.set(key, v) }
    return v
  }
  const lift = useRef(new Animated.Value(0)).current

  // The drag in progress, read by the gesture and the autoscroll loop between renders.
  const live = useRef<{ from: number; to: number; dy: number; pointerY: number; scroll0: number } | null>(null)
  const scrollRef = useRef<ScrollViewInstance>(null)
  const frameRef = useRef<ViewInstance>(null)
  const scrollY = useRef(0)
  const frame = useRef({ top: 0, bottom: 0, viewH: 0, contentH: 0 })
  const raf = useRef<number | null>(null)
  // After a drop or cancel, how the rows get back to rest once the new order has rendered.
  const [settle, setSettle] = useState<{ seq: number; key: string | null; residual: number }>({ seq: 0, key: null, residual: 0 })
  const swallowEscapeUp = useRef(false)

  const announce = (from: number, to: number) => {
    const msg = t('workouts.reorder.moved', { name: latest.current.names[from], position: to + 1, count: latest.current.count })
    if (Platform.OS === 'web') setAnnouncement(msg)
    else AccessibilityInfo.announceForAccessibility(msg)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= latest.current.count || from === to) return
    announce(from, to)
    latest.current.onMove(from, to)
  }

  const moveBy = (index: number, delta: -1 | 1) => {
    const to = index + delta
    move(index, to)
    if (Platform.OS !== 'web') return
    const key = rowKeys[index]
    const atEdge = to === 0 || to === count - 1
    const dir = delta < 0 ? 'up' : 'down'
    setRefocus(`${key}|${atEdge ? (dir === 'up' ? 'down' : 'up') : dir}`)
  }

  useEffect(() => {
    if (!refocus) return
    ;(buttons.current.get(refocus) as unknown as HTMLElement | null)?.focus?.()
    setRefocus(null)
  }, [refocus])

  const animateTo = (v: Animated.Value, toValue: number) => {
    const duration = latest.current.motion.fast
    if (duration === 0) { v.stopAnimation(); v.setValue(toValue); return }
    Animated.timing(v, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }).start()
  }

  const stopAutoScroll = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current)
    raf.current = null
  }

  // Where the held row is drawn and which slot it is over: the finger's travel plus however
  // far the list has scrolled under it since the lift.
  const track = () => {
    const d = live.current
    if (!d) return
    const { rowKeys: keys, count: n } = latest.current
    const offset = d.dy + scrollY.current - d.scroll0
    posFor(keys[d.from]).setValue(offset)
    const to = dragTarget(d.from, offset, n)
    if (to === d.to) return
    d.to = to
    keys.forEach((k, i) => { if (i !== d.from) animateTo(posFor(k), shiftFor(i, d.from, to)) })
    setDrag({ from: d.from, to })
    haptic(() => Haptics.selectionAsync())
  }

  const autoScroll = () => {
    let last = 0
    const tick = (ts: number) => {
      const d = live.current
      if (!d) { raf.current = null; return }
      const dt = last ? Math.min(48, ts - last) : 16
      last = ts
      const f = frame.current
      const speed = autoScrollSpeed(d.pointerY, f.top, f.top + f.viewH)
      const max = Math.max(0, f.contentH - f.viewH)
      const next = Math.max(0, Math.min(max, scrollY.current + (speed * dt) / 1000))
      if (next !== scrollY.current) {
        scrollY.current = next
        scrollRef.current?.scrollTo({ y: next, animated: false })
        track()
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  const onLift = (from: number, pointerY: number) => {
    if (live.current) return
    live.current = { from, to: from, dy: 0, pointerY, scroll0: scrollY.current }
    measureFrame()
    setDrag({ from, to: from })
    if (!latest.current.motion.reduced) animateTo(lift, 1)
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
    autoScroll()
  }

  const onDragMove = (dy: number, pointerY: number) => {
    const d = live.current
    if (!d) return
    d.dy = dy
    d.pointerY = pointerY
    track()
  }

  const finish = (commit: boolean) => {
    const d = live.current
    if (!d) return
    live.current = null
    stopAutoScroll()
    animateTo(lift, 0)
    const offset = d.dy + scrollY.current - d.scroll0
    const moved = commit && d.to !== d.from
    const key = latest.current.rowKeys[d.from]
    // The held row lands in its slot from wherever the finger left it.
    setSettle((s) => ({ seq: s.seq + 1, key: moved ? key : null, residual: offset - (d.to - d.from) * STRIDE }))
    setDrag(null)
    if (moved) {
      move(d.from, d.to)
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
    }
  }

  // Runs after the reordered list has rendered and before it is painted: every row already
  // stands in its new slot, so its shift goes to zero at once, and only the dropped row
  // glides the last bit. A cancelled drag animates everything back instead.
  useLayoutEffect(() => {
    if (settle.seq === 0) return
    latest.current.rowKeys.forEach((k) => {
      const v = posFor(k)
      if (settle.key === null) { animateTo(v, 0); return }
      v.stopAnimation()
      v.setValue(k === settle.key ? settle.residual : 0)
      if (k === settle.key) animateTo(v, 0)
    })
     
  }, [settle])

  useEffect(() => {
    if (open) return
    live.current = null
    stopAutoScroll()
    setDrag(null)
    setAnnouncement('')
    // The list remounts at the top on the next open, and a remount reports no scroll.
    scrollY.current = 0
    frame.current = { top: 0, bottom: 0, viewH: 0, contentH: 0 }
    pos.current.forEach((v) => v.setValue(0))
    lift.setValue(0)
  }, [open, lift])

  useEffect(() => stopAutoScroll, [])

  // Web: Escape drops the held row back where it was, and only that. The Modal closes on the
  // Escape keyup at the document, so the keyup that belongs to this cancel is stopped first.
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return
    const down = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !live.current) return
      e.preventDefault()
      e.stopPropagation()
      swallowEscapeUp.current = true
      finish(false)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !swallowEscapeUp.current) return
      swallowEscapeUp.current = false
      e.stopPropagation()
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const scale = useMemo(() => lift.interpolate({ inputRange: [0, 1], outputRange: [1, LIFT_SCALE] }), [lift])
  const measureFrame = () => frameRef.current?.measureInWindow((_x, y, _w, h) => { frame.current.top = y; frame.current.viewH = h })

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId} width="sm">
      <View className="px-6">
        <AppText nativeID={titleId} variant="heading" className="text-center">{t('workouts.reorder.title')}</AppText>
        <AppText variant="caption" color="muted" className="mb-4 mt-1 text-center">{t('workouts.reorder.hint')}</AppText>
        <View
          ref={frameRef}
          onLayout={(e) => { frame.current.viewH = e.nativeEvent.layout.height; measureFrame() }}
        >
          <ScrollView
            ref={scrollRef}
            testID="reorder-list"
            style={{ maxHeight: Math.max(STRIDE * 3, height * 0.55) }}
            // Native: frozen while a row is held, so the list cannot take the finger over; it
            // moves only by autoscroll then. Web keeps it scrollable: switching overflow off
            // makes the browser blur the list if it had focus (Chrome focuses scrollers), and
            // react-native-web ends a gesture whose ancestor blurs. The row's own touchmove
            // listener holds the page still instead.
            scrollEnabled={Platform.OS === 'web' || !drag}
            // Native: while a row is held the autoscroll owns the offset; a scroll event from its
            // own scrollTo can arrive a frame late and would put it back a step.
            onScroll={(e) => { if (Platform.OS === 'web' || !live.current) scrollY.current = e.nativeEvent.contentOffset.y }}
            scrollEventThrottle={16}
            onContentSizeChange={(_w, h) => { frame.current.contentH = h }}
            // iOS: a bouncing list can start its own pan on a flick and cancel a drag.
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {drag ? (
              // Where the held row will land: the gap the other rows open for it.
              <View
                pointerEvents="none"
                className="absolute left-0 right-0 rounded-xl border border-dashed"
                style={{ top: drag.to * STRIDE, height: ROW_H, borderColor: accent }}
              />
            ) : null}
            {names.map((name, i) => {
              const key = rowKeys[i]
              const dragging = drag?.from === i
              return (
                <Animated.View
                  key={key}
                  testID={`reorder-row-${i}`}
                  style={[
                    { height: ROW_H, marginBottom: GAP, zIndex: dragging ? 2 : 1, borderRadius: 12 },
                    dragging ? LIFTED_SHADOW : null,
                    { transform: [{ translateY: posFor(key) }, { scale: dragging ? scale : 1 }] },
                  ]}
                >
                  <ReorderRow
                    index={i}
                    name={name}
                    count={count}
                    dragging={dragging}
                    gripColor={colors.txMuted}
                    onLift={onLift}
                    onDragMove={onDragMove}
                    onDrop={() => finish(true)}
                    onCancel={() => finish(false)}
                    onMoveBy={moveBy}
                    upRef={(r) => { buttons.current.set(`${key}|up`, r) }}
                    downRef={(r) => { buttons.current.set(`${key}|down`, r) }}
                  />
                </Animated.View>
              )
            })}
          </ScrollView>
        </View>
        <View accessibilityLiveRegion="polite" style={SR_ONLY}>
          <AppText variant="caption">{announcement}</AppText>
        </View>
        <View className="mt-3">
          <SheetButton label={t('common.done')} variant="primary" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  )
}

type Phase = 'idle' | 'pending' | 'active'

function ReorderRow({
  index, name, count, dragging, gripColor, onLift, onDragMove, onDrop, onCancel, onMoveBy, upRef, downRef,
}: {
  index: number
  name: string
  count: number
  dragging: boolean
  gripColor: string
  onLift: (from: number, pointerY: number) => void
  onDragMove: (dy: number, pointerY: number) => void
  onDrop: () => void
  onCancel: () => void
  onMoveBy: (index: number, delta: -1 | 1) => void
  upRef: (r: PressableInstance | null) => void
  downRef: (r: PressableInstance | null) => void
}) {
  const { t } = useTranslation()
  // The held row is the lightest surface in either theme, so it reads as raised above the rest.
  const { isDark } = useTheme()
  const lifted = isDark ? 'bg-surface-border' : 'bg-surface-raised'
  // The responder is created once; the row's index changes under it as rows move.
  const live = useRef({ index, onLift, onDragMove, onDrop, onCancel })
  live.current = { index, onLift, onDragMove, onDrop, onCancel }
  const phase = useRef<Phase>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowRef = useRef<ViewInstance>(null)
  const pointer = useRef<'touch' | 'mouse'>('mouse')

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  // PanResponder rather than gesture-handler, for the reason Sheet.tsx gives: the sheet is a
  // Modal, its own native root, with no gesture-handler root view inside it. The arrow
  // buttons are deeper in the tree, so a press that starts on one stays theirs.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Android: leave the list free to take the touch over as a scroll until the row lifts.
      // Once it has, the list's scrolling is switched off, so there is nothing left to take it.
      onShouldBlockNativeResponder: () => false,
      // Before the lift, a scroll of the list wins (iOS and web ask; Android just takes it).
      // After it, nothing may take the gesture over — not even the autoscroll's own scrolling,
      // which react-native-web would otherwise treat as the user scrolling an ancestor.
      onPanResponderTerminationRequest: () => phase.current !== 'active',
      onPanResponderGrant: (e: GestureResponderEvent, g) => {
        const type = String((e.nativeEvent as { type?: string }).type ?? '')
        const mouse = Platform.OS === 'web' && type.startsWith('mouse')
        phase.current = 'pending'
        pointer.current = mouse ? 'mouse' : 'touch'
        if (mouse) return
        const y0 = g.y0
        timer.current = setTimeout(() => {
          timer.current = null
          if (phase.current !== 'pending') return
          phase.current = 'active'
          live.current.onLift(live.current.index, y0)
        }, LIFT_DELAY)
      },
      onPanResponderMove: (_e, g) => {
        if (phase.current === 'pending') {
          const dist = Math.hypot(g.dx, g.dy)
          if (pointer.current === 'touch') {
            // Moved before the hold completed: that was a scroll, not a lift.
            if (dist > TOUCH_SLOP) { clearTimer(); phase.current = 'idle' }
            return
          }
          if (dist < MOUSE_SLOP) return
          phase.current = 'active'
          live.current.onLift(live.current.index, g.y0)
        }
        if (phase.current === 'active') live.current.onDragMove(g.dy, g.moveY)
      },
      onPanResponderRelease: () => end(true),
      onPanResponderTerminate: () => end(false),
    }),
  ).current

  function end(commit: boolean) {
    clearTimer()
    const was = phase.current
    phase.current = 'idle'
    pointer.current = 'mouse'
    if (was !== 'active') return
    if (commit) live.current.onDrop()
    else live.current.onCancel()
  }

  useEffect(() => clearTimer, [])

  // Web: react-native-web listens for touchmove on the document, which browsers make passive,
  // and React's own touch listeners are passive too, so neither can stop the page from
  // scrolling under a lifted row. A listener on the row itself can. A long press would also
  // open the browser's context menu (Android) or callout (iOS) under a held finger. And a
  // mouse press on the row must not move focus: the sheet's focus trap can leave focus on the
  // list itself, react-native-web ends a gesture when an ancestor of it blurs, and a press on
  // a plain row would blur the list and cancel its own drag. The arrow buttons still take
  // focus when pressed.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const node = rowRef.current as unknown as HTMLElement | null
    if (!node?.addEventListener) return
    const holdStill = (e: Event) => { if (phase.current === 'active' && e.cancelable) e.preventDefault() }
    const noMenu = (e: Event) => { if (phase.current !== 'idle') e.preventDefault() }
    const keepFocus = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('[role="button"]')) e.preventDefault()
    }
    node.addEventListener('touchmove', holdStill, { passive: false })
    node.addEventListener('mousedown', keepFocus)
    node.addEventListener('contextmenu', noMenu)
    return () => {
      node.removeEventListener('touchmove', holdStill)
      node.removeEventListener('mousedown', keepFocus)
      node.removeEventListener('contextmenu', noMenu)
    }
  }, [])

  return (
    <View
      ref={rowRef}
      {...pan.panHandlers}
      testID={`reorder-body-${index}`}
      className={`h-full flex-row items-center gap-2 rounded-xl border pl-3 pr-1 ${dragging ? `border-brand-500/50 ${lifted}` : 'border-surface-border bg-surface-muted'}`}
      style={Platform.OS === 'web'
        ? ({ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as object)
        : undefined}
    >
      {/* Pointer-only, so hidden from assistive tech: the buttons beside it are the
          screen-reader and keyboard path to the same move. The whole row drags; the grip
          says so. */}
      <View
        testID={`reorder-handle-${index}`}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="-ml-1 w-5 items-center justify-center"
      >
        <GripVertical size={16} color={gripColor} />
      </View>
      <AppText variant="bodySemibold" color="muted" style={{ fontVariant: ['tabular-nums'], minWidth: 18 }}>{index + 1}</AppText>
      <AppText variant="body" numberOfLines={1} className="flex-1">{name}</AppText>
      <IconButton
        ref={upRef}
        icon={ChevronUp}
        label={t('workouts.reorder.moveUp', { name })}
        disabled={index === 0}
        onPress={() => onMoveBy(index, -1)}
      />
      <IconButton
        ref={downRef}
        icon={ChevronDown}
        label={t('workouts.reorder.moveDown', { name })}
        disabled={index === count - 1}
        onPress={() => onMoveBy(index, 1)}
      />
    </View>
  )
}

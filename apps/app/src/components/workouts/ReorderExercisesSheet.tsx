import { useEffect, useId, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, PanResponder, Platform, ScrollView, View, useWindowDimensions, type PressableInstance } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { ChevronDown, ChevronUp, GripVertical } from '../ui/icons'
import { AppText, IconButton, Sheet, SheetButton } from '../ui'
import { useTheme } from '../../theme/useTheme'

// Every row is the same height, so a drag's target slot is its offset divided by the
// stride: no measuring, and the rows between source and target shift by exactly one stride.
const ROW_H = 52
const GAP = 6
const STRIDE = ROW_H + GAP

/** The slot a row dragged `offset` px from slot `from` lands in, clamped to the list. */
export const dragTarget = (from: number, offset: number, count: number) =>
  Math.max(0, Math.min(count - 1, from + Math.round(offset / STRIDE)))

// Visually hidden but still read: the web half of the move announcement. react-native-web's
// AccessibilityInfo.announceForAccessibility is an empty function.
const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const

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

// Reorder as its own step reached from the exercise, the way StrengthLog ("Reorder
// exercises") and Hevy (drag and drop from the exercise menu) do it: dragging a whole exercise card, set table and
// all, past other tall cards is the hard version of the same task. Each row has a drag
// handle and up/down buttons — the buttons are the single-pointer and keyboard path that
// WCAG 2.5.7 asks a drag to have. Every move applies at once; Done just closes.
export function ReorderExercisesSheet({ open, names, rowKeys, onMove, onClose }: Props) {
  const { t } = useTranslation()
  const { height } = useWindowDimensions()
  const titleId = useId()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const dy = useRef(new Animated.Value(0)).current
  // Web: the button pressed travels with its row, and the browser drops focus when React
  // moves a focused node. Put it back on the same control (or its twin at an edge).
  const buttons = useRef(new Map<string, PressableInstance | null>())
  const [refocus, setRefocus] = useState<string | null>(null)

  const count = names.length
  const latest = useRef({ names, count, onMove })
  latest.current = { names, count, onMove }

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

  useEffect(() => {
    if (!open) { setDrag(null); setAnnouncement('') }
  }, [open])

  const startDrag = (from: number) => {
    dy.setValue(0)
    setDrag({ from, to: from })
  }
  const dragTo = (from: number, offset: number) => {
    dy.setValue(offset)
    const to = dragTarget(from, offset, latest.current.count)
    setDrag((d) => (d && d.to !== to ? { from: d.from, to } : d))
  }
  const endDrag = (from: number, offset: number, commit: boolean) => {
    const to = dragTarget(from, offset, latest.current.count)
    // dy is left where it is: zeroing it here would flash the row back to its old slot for a
    // frame before the reordered list renders. A row that is not being dragged ignores dy.
    setDrag(null)
    if (commit) move(from, to)
  }

  // Where every other row sits while one is dragged: the rows between source and target
  // slide one stride toward the gap the dragged row left.
  const shiftFor = (i: number) => {
    if (!drag || i === drag.from) return 0
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -STRIDE
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return STRIDE
    return 0
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId} width="sm">
      <View className="px-6">
        <AppText nativeID={titleId} variant="heading" className="text-center">{t('workouts.reorder.title')}</AppText>
        <AppText variant="caption" color="muted" className="mb-4 mt-1 text-center">{t('workouts.reorder.hint')}</AppText>
        <ScrollView
          style={{ maxHeight: Math.max(STRIDE * 3, height * 0.55) }}
          // Frozen while a row is dragged, and there is no autoscroll: a row beyond the visible
          // part of a long list is reached with the arrows, which go anywhere.
          scrollEnabled={!drag}
          // iOS: a bouncing list can start its own pan on a short flick, before the state update
          // above reaches it, and cancel the drag.
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {names.map((name, i) => {
            const key = rowKeys[i]
            const dragging = drag?.from === i
            return (
              <Animated.View
                key={key}
                testID={`reorder-row-${i}`}
                style={{
                  height: ROW_H,
                  marginBottom: GAP,
                  zIndex: dragging ? 1 : 0,
                  elevation: dragging ? 4 : 0,
                  transform: [{ translateY: dragging ? dy : shiftFor(i) }],
                }}
              >
                <ReorderRow
                  index={i}
                  name={name}
                  count={count}
                  dragging={dragging}
                  onDragStart={startDrag}
                  onDragMove={dragTo}
                  onDragEnd={endDrag}
                  onMoveBy={moveBy}
                  upRef={(r) => { buttons.current.set(`${key}|up`, r) }}
                  downRef={(r) => { buttons.current.set(`${key}|down`, r) }}
                />
              </Animated.View>
            )
          })}
        </ScrollView>
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

function ReorderRow({
  index, name, count, dragging, onDragStart, onDragMove, onDragEnd, onMoveBy, upRef, downRef,
}: {
  index: number
  name: string
  count: number
  dragging: boolean
  onDragStart: (from: number) => void
  onDragMove: (from: number, offset: number) => void
  onDragEnd: (from: number, offset: number, commit: boolean) => void
  onMoveBy: (index: number, delta: -1 | 1) => void
  upRef: (r: PressableInstance | null) => void
  downRef: (r: PressableInstance | null) => void
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // The responder is created once; the row's index changes under it as rows move.
  const live = useRef({ index, onDragStart, onDragMove, onDragEnd })
  live.current = { index, onDragStart, onDragMove, onDragEnd }
  // The index the drag started from: the row re-renders mid-drag, its index does not.
  const from = useRef(0)
  // PanResponder rather than gesture-handler, for the reason Sheet.tsx gives: the sheet is a
  // Modal, its own native root, with no gesture-handler root view inside it.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The list's ScrollView must not take the gesture over halfway through a drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        from.current = live.current.index
        live.current.onDragStart(from.current)
      },
      onPanResponderMove: (_, g) => live.current.onDragMove(from.current, g.dy),
      onPanResponderRelease: (_, g) => live.current.onDragEnd(from.current, g.dy, true),
      onPanResponderTerminate: () => live.current.onDragEnd(from.current, 0, false),
    }),
  ).current

  return (
    <View
      className={`h-full flex-row items-center gap-2 rounded-xl border pl-3 pr-1 ${dragging ? 'border-brand-500/40 bg-surface-overlay' : 'border-surface-border bg-surface-muted/40'}`}
    >
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
      {/* Pointer-only, so hidden from assistive tech: the buttons beside it are the
          screen-reader and keyboard path to the same move. */}
      <View
        {...pan.panHandlers}
        testID={`reorder-handle-${index}`}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="h-11 w-10 items-center justify-center"
        style={Platform.OS === 'web' ? ({ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' } as object) : undefined}
      >
        <GripVertical size={18} color={colors.txMuted} />
      </View>
    </View>
  )
}

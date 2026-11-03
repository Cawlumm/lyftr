import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from '@lyftr/shared'
import { AnchoredOverlay } from './AnchoredOverlay.web'
import type { ChartTooltipProps } from './ChartTooltip'
import { swallowEscapeKeyup } from './overlay'
import { AppText } from './Typography'

// Long enough to cross from the chart onto the tooltip (WCAG 1.4.13, hoverable).
const HIDE_DELAY = 120
const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

// A transparent layer over a react-native-svg chart that reads its points on web: the pointer
// selects the nearest one, the chart takes focus and arrow keys step through them, Home/End
// jump, Escape dismisses. A DOM layer rather than handlers on the SVG shapes: react-native-svg's
// web build routes only onPress/onPressIn/onPressOut through RN's responder
// (src/web/utils/prepare.ts), so hover has no documented path there. The values are also listed
// for screen readers, which read a list in browse mode where arrow keys never reach the chart.
export function ChartTooltip({ label, points, width, height, hitTest, describe, selected, onSelect, tooltip = true }: ChartTooltipProps) {
  const { t } = useTranslation()
  const tipId = useId()
  const hintId = useId()
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const n = points.length

  const show = (i: number | null) => { clearTimeout(timer.current); onSelect(i) }
  const hideLater = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onSelect(null), HIDE_DELAY)
  }
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - box.left
    if (hitTest) return hitTest(x, e.clientY - box.top)
    let best = 0
    for (let i = 1; i < n; i++) if (Math.abs(points[i].x - x) < Math.abs(points[best].x - x)) best = i
    return best
  }
  const point = (e: PointerEvent<HTMLDivElement>) => {
    const i = pick(e)
    if (i == null) hideLater()
    else show(i)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (selected == null) return
    // Escape dismisses wherever focus is (WCAG 1.4.13); a dialog beneath takes the next one.
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      clearTimeout(timer.current)
      onSelect(null)
      swallowEscapeKeyup()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, onSelect])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = n - 1
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : e.key in STEP ? Math.min(Math.max((selected ?? last) + STEP[e.key], 0), last)
      : null
    if (next == null) return
    e.preventDefault()
    show(next)
  }

  const sel = selected != null && selected < n ? points[selected] : null
  const open = tooltip && sel != null

  return (
    <>
      <div
        tabIndex={0}
        role="img"
        aria-label={label}
        aria-describedby={open ? `${hintId} ${tipId}` : hintId}
        className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
        // pan-y: a vertical swipe still scrolls the page; a horizontal one scrubs the chart.
        style={{ position: 'absolute', left: 0, top: 0, width, height, touchAction: 'pan-y' }}
        onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) point(e) }}
        onPointerDown={(e) => { if (e.pointerType !== 'mouse') point(e) }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideLater() }}
        onFocus={(e) => { if (selected == null && e.currentTarget.matches(':focus-visible')) show(n - 1) }}
        onBlur={() => show(null)}
        onKeyDown={onKeyDown}
      >
        <div ref={setAnchor} style={{ position: 'absolute', left: sel?.x ?? 0, top: sel?.y ?? 0 }} />
      </div>
      <span id={hintId} hidden>{t('common.chart.keyHint')}</span>
      <ul className="sr-only" aria-label={label}>
        {points.map((_, i) => <li key={i}>{describe(i).join(', ')}</li>)}
      </ul>
      {anchor && open ? (
        <AnchoredOverlay
          key={selected}
          id={tipId}
          role="tooltip"
          anchor={anchor}
          open
          side="top"
          align="center"
          gap={10}
          onMouseEnter={() => clearTimeout(timer.current)}
          onMouseLeave={hideLater}
          className="max-w-[260px] rounded-lg bg-tx-primary px-2.5 py-1.5 shadow-lg"
        >
          {/* react-native-web lays Text out inline, so the lines need a column to stack in. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {describe(selected!).map((line, i) => (
              <AppText key={i} variant={i === 0 ? 'bodySemibold' : 'caption'} color="inverse" style={{ fontVariant: ['tabular-nums'] }}>
                {line}
              </AppText>
            ))}
          </div>
        </AnchoredOverlay>
      ) : null}
    </>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import type { TooltipProps } from './Tooltip'
import { AnchoredOverlay } from './AnchoredOverlay.web'
import { AppText } from './Typography'

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
// Same ring as interaction.ts, for a trigger that was not focusable until the tooltip made it so.
const RING = ['focus-visible:outline', 'focus-visible:outline-2', 'focus-visible:outline-focus', 'focus-visible:outline-offset-2']
const SHOW_DELAY = 300
// Long enough to cross the gap from the trigger onto the tooltip (WCAG 1.4.13, hoverable).
const HIDE_DELAY = 120

// The APG tooltip pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/): role=tooltip,
// referenced from the trigger by aria-describedby, shown on hover and on keyboard focus, gone on
// blur and on Escape while focus stays put, and kept open while the pointer is over it.
export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  const id = useId()
  const host = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const later = (next: boolean, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(next), ms)
  }
  const now = (next: boolean) => { clearTimeout(timer.current); setOpen(next) }

  // The trigger is whatever the child renders, which may not forward aria props, so the
  // description is attached to its DOM node directly.
  useEffect(() => {
    const first = host.current?.firstElementChild as HTMLElement | null
    if (!first) return
    const el = first.matches(FOCUSABLE) ? first : first.querySelector<HTMLElement>(FOCUSABLE) ?? first
    const madeFocusable = !el.matches(FOCUSABLE)
    if (madeFocusable) {
      el.tabIndex = 0
      el.classList.add(...RING)
    }
    const before = el.getAttribute('aria-describedby')
    el.setAttribute('aria-describedby', before ? `${before} ${id}` : id)
    setAnchor(el)
    return () => {
      if (before) el.setAttribute('aria-describedby', before)
      else el.removeAttribute('aria-describedby')
      if (madeFocusable) {
        el.removeAttribute('tabindex')
        el.classList.remove(...RING)
      }
    }
  }, [id])

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') now(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    // display:contents: the wrapper only listens; it must not change the trigger's layout.
    <span
      ref={host}
      style={{ display: 'contents' }}
      onMouseEnter={() => later(true, SHOW_DELAY)}
      onMouseLeave={() => later(false, HIDE_DELAY)}
      onFocus={(e) => { if (e.target === anchor && e.target.matches(':focus-visible')) now(true) }}
      onBlur={() => now(false)}
    >
      {children}
      {anchor ? (
        <AnchoredOverlay
          id={id}
          role="tooltip"
          anchor={anchor}
          open={open}
          side={side}
          align="center"
          onMouseEnter={() => clearTimeout(timer.current)}
          onMouseLeave={() => later(false, HIDE_DELAY)}
          className="max-w-[260px] rounded-lg bg-tx-primary px-2.5 py-1.5 shadow-lg"
        >
          <AppText variant="caption" color="inverse">{content}</AppText>
        </AnchoredOverlay>
      ) : null}
    </span>
  )
}

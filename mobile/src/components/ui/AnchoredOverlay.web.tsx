import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { placeOverlay, type Align, type Side } from './overlay'

interface Props extends HTMLAttributes<HTMLDivElement> {
  anchor: HTMLElement
  open: boolean
  side: Side
  align: Align
  gap?: number
}

// The floating half of ChartTooltip and Menu: portalled so no overflow:hidden card clips it,
// position:fixed against the anchor, flipped and slid to stay on screen.
export const AnchoredOverlay = forwardRef<HTMLDivElement, Props>(function AnchoredOverlay(
  { anchor, open, side, align, gap, style, children, ...rest },
  ref,
) {
  const el = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => el.current as HTMLDivElement)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Inside a sheet the overlay must live in the dialog: RN Modal pulls focus back from
  // anything outside it, which would make a menu's items unreachable.
  const container = anchor.closest('[aria-modal="true"]') ?? document.body

  useLayoutEffect(() => {
    const node = el.current
    if (!open || !node) { setPos(null); return }
    const update = () => {
      const box = node.getBoundingClientRect()
      // A transformed ancestor (the dialog's scale-in) is the containing block of a fixed
      // element, so measure where the current left/top actually landed and correct for it.
      const originX = box.left - (parseFloat(node.style.left) || 0)
      const originY = box.top - (parseFloat(node.style.top) || 0)
      const p = placeOverlay(
        anchor.getBoundingClientRect(),
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
        side, align, gap,
      )
      setPos({ top: p.top - originY, left: p.left - originX })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchor, side, align, gap])

  return createPortal(
    <div
      ref={el}
      {...rest}
      style={{
        position: 'fixed',
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        zIndex: 10000,
        display: open ? undefined : 'none',
        // Transparent until measured, so it never flashes at the corner; not visibility:hidden,
        // which would refuse the focus a menu moves in on the same tick. No entrance motion:
        // like a native menu or the browser's own title tooltip, it is simply there.
        opacity: pos ? undefined : 0,
        ...style,
      }}
    >
      {children}
    </div>,
    container,
  )
})

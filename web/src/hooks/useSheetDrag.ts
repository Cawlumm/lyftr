import { useRef, useState, type TouchEvent } from 'react'

// Swipe a bottom sheet down to dismiss it. Attach `handlers` to the part that should act as the
// handle (the grabber and header), not the whole sheet, so the scrolling list inside keeps its own
// scrolling. Touch only: with a mouse the sheet has a close button and Escape.
export function useSheetDrag(onClose: () => void, threshold = 90) {
  const [dy, setDy] = useState(0)
  const startY = useRef<number | null>(null)
  // Read on release instead of the state: a flick whose last move has not re-rendered yet would
  // otherwise be judged on a stale distance and fail to dismiss.
  const lastDy = useRef(0)

  const handlers = {
    onTouchStart: (e: TouchEvent) => { startY.current = e.touches[0].clientY },
    onTouchMove: (e: TouchEvent) => {
      if (startY.current == null) return
      lastDy.current = Math.max(0, e.touches[0].clientY - startY.current)
      setDy(lastDy.current)
    },
    onTouchEnd: () => {
      if (lastDy.current > threshold) onClose()
      startY.current = null
      lastDy.current = 0
      setDy(0)
    },
    onTouchCancel: () => { startY.current = null; lastDy.current = 0; setDy(0) },
  }

  return {
    handlers,
    // Keeps the browser from starting its own vertical pan (or pull-to-refresh) on the handle.
    handleStyle: { touchAction: 'none' } as const,
    // No transition while the finger is down, so the sheet follows it; it springs back on release.
    style: dy > 0 ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined,
  }
}

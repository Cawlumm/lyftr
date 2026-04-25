import { useEffect } from 'react'

/**
 * Calls `onEscape` when the user presses Escape, but only while `active` is
 * true. Use in any modal/sheet/drawer for keyboard dismissal.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscape()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onEscape])
}

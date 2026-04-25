import { useEffect } from 'react'

/**
 * Lock body scroll while `active` is true. Restores the previous overflow
 * value on cleanup, and ref-counts across multiple concurrent locks so
 * stacked modals don't fight each other.
 *
 * Use this in any modal/sheet/drawer when it's open so the page underneath
 * doesn't scroll on touch devices.
 */
let lockCount = 0
let prevOverflow = ''

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (lockCount === 0) {
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount++
    return () => {
      lockCount--
      if (lockCount === 0) {
        document.body.style.overflow = prevOverflow
      }
    }
  }, [active])
}

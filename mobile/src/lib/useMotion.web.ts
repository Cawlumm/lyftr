import { useSyncExternalStore } from 'react'
import { motionFor } from '../theme/motion'

const QUERY = '(prefers-reduced-motion: reduce)'
const query = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null)

function subscribe(onChange: () => void) {
  const mq = query()
  mq?.addEventListener('change', onChange)
  return () => mq?.removeEventListener('change', onChange)
}

// Unlike Reanimated's useReducedMotion this follows the setting live, so toggling it in the OS
// stops a running loader without a reload.
export function useMotion() {
  return motionFor(useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false))
}

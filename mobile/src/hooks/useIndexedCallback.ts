import { useRef } from 'react'

// Same goal as useStableCallback, but for a list rendered inline (`items.map(...)`)
// where each row needs its OWN handler bound to its index — a hook can't be called
// per loop iteration, so a single per-index useCallback isn't an option. Call this
// once per render with a factory that builds a row's handler from its index; the
// returned `get(index)` hands back a cached, permanently-stable function per index.
// The factory itself may freely close over current props/state each render — it's
// re-invoked (via ref) on every call, so it always sees fresh values, while the
// wrapper handed to the memoized child never changes identity.
export function useIndexedCallback<A extends unknown[]>(
  factory: (index: number) => (...args: A) => void
): (index: number) => (...args: A) => void {
  const factoryRef = useRef(factory)
  factoryRef.current = factory
  const cache = useRef(new Map<number, (...args: A) => void>()).current
  return useRef((index: number) => {
    let fn = cache.get(index)
    if (!fn) {
      fn = (...args: A) => factoryRef.current(index)(...args)
      cache.set(index, fn)
    }
    return fn
  }).current
}

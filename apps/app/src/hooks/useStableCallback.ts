import { useRef } from 'react'

// Wraps a function in a permanently stable identity that always calls the latest
// version passed in. For a memoized list-item component (e.g. ExerciseFormCard),
// a handler built with plain useCallback(fn, [deps]) gets a new identity whenever
// any of those deps change — which, for a handler that reads the full items array
// or an external onChange prop, is every single edit. That invalidates the memo
// for every item, not just the edited one. This hook fixes that: the returned
// function's identity never changes, so unaffected items' props stay reference-
// equal and their memo bails correctly.
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const fnRef = useRef(fn)
  fnRef.current = fn
  return useRef((...args: A) => fnRef.current(...args)).current
}

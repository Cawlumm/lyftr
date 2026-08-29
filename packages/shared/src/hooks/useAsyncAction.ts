import { useCallback, useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../client'

export interface AsyncAction<A extends unknown[]> {
  /** True while the action is in flight. Gate the button on this. */
  busy: boolean
  /** '' until the action fails, then the sentence a person should read. */
  error: string
  /** Runs the action. Resolves true on success, false if it failed. */
  run: (...args: A) => Promise<boolean>
  /** Drop a stale message — on dismiss, or when the form changes underneath it. */
  reset: () => void
}

// One way to run a request that can fail.
//
// Before this there were forty-odd copies of the same six lines — set a busy flag, try,
// await, catch, set a message, clear the flag — and they did not agree. Some read
// `err.response.data.error` directly, which is empty for the failures that matter most
// (a timeout has no response at all), so the screen fell back to "Failed to save" and
// told the user nothing. Some caught with a bare `catch {}` and said nothing whatsoever,
// which made a failed delete look identical to a tap that never registered. Several
// dismissed the sheet they were in, sending the explanation to a banner at the top of a
// list the user had scrolled away from.
//
// Those were not sloppy call sites; they were forty chances to get one thing right.
// `apiErrorMessage` lives INSIDE this hook for that reason: the wording is no longer
// something a call site can bypass, forget, or half-remember.
//
// What it deliberately does not do: decide what success means. Navigating, closing a
// sheet, refetching a list — that stays in the action, where the screen can see it.
export function useAsyncAction<A extends unknown[] = []>(
  action: (...args: A) => Promise<unknown>,
  fallbackMessage: string,
): AsyncAction<A> {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Latest-callback refs. Screens pass an inline closure that reads current state, so
  // `action` has a fresh identity every render — capturing it in the useCallback deps
  // would give `run` a fresh identity too, and `run` is handed to memoized rows and
  // cards. Reading through a ref keeps `run` permanently stable while still calling the
  // newest closure, so a per-second tick elsewhere on the screen cannot invalidate it.
  const latest = useRef(action)
  latest.current = action
  const fallback = useRef(fallbackMessage)
  fallback.current = fallbackMessage

  // A successful action usually navigates away or closes the surface it lives on, so by
  // the time the promise resolves this component may be gone. Setting state then is a
  // no-op in React 18+, but the guard keeps that an intention rather than a coincidence.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const run = useCallback(async (...args: A): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      await latest.current(...args)
      return true
    } catch (err) {
      if (mounted.current) setError(apiErrorMessage(err, fallback.current))
      return false
    } finally {
      // In `finally`, not only on the failure path: a screen that stays put after
      // succeeding (Settings, a password change) would otherwise read "Saving…" forever.
      if (mounted.current) setBusy(false)
    }
  }, [])

  const reset = useCallback(() => setError(''), [])

  return { busy, error, run, reset }
}

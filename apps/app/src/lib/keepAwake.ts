import { useEffect } from 'react'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'

const KEEP_AWAKE_TAG = 'lyftr-workout-session'

// Keep the screen on while `active`. Returns whether the screen may sleep anyway; the
// native module always honours the request, so that is never true here (see keepAwake.web.ts).
export function useSessionKeepAwake(active: boolean): boolean {
  useEffect(() => {
    if (!active) return
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})
    return () => { deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {}) }
  }, [active])
  return false
}

import { useEffect, useState } from 'react'

// expo-keep-awake's web module neither re-acquires after the tab is hidden (browsers
// release a screen wake lock then) nor copes with navigator.wakeLock being undefined,
// which it is over plain HTTP. https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
export function useSessionKeepAwake(active: boolean): boolean {
  const [unsupported, setUnsupported] = useState(false)

  useEffect(() => {
    if (!active) return
    if (!window.isSecureContext || !navigator.wakeLock) {
      setUnsupported(true)
      return
    }
    let sentinel: WakeLockSentinel | null = null
    let pending = false
    let stopped = false

    const acquire = async () => {
      if (stopped || pending || document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      pending = true
      try {
        const next = await navigator.wakeLock.request('screen')
        if (stopped) next.release().catch(() => {})
        else sentinel = next
      } catch {
        // Refused (battery saver, permissions policy): the screen may sleep, nothing to do.
      } finally {
        pending = false
      }
    }

    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      sentinel?.release().catch(() => {})
      setUnsupported(false)
    }
  }, [active])

  return unsupported
}

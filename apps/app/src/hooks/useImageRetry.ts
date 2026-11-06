import { useEffect, useState } from 'react'

// One 429 or a dropped packet used to leave the fallback glyph up for the rest of the
// session, because "failed" outlived the load that failed. So a failure belongs to one
// url, and earns exactly one retry. The retry waits and is jittered: a list that hit
// oedb's per-IP image limit (600/min) fails all at once, and must not come back all at
// once either.
export const IMAGE_RETRY_DELAY_MS = 3000
export const IMAGE_RETRY_JITTER_MS = 2000

interface State { url?: string; failed: boolean; retried: boolean }

export function useImageRetry(url?: string) {
  const [state, setState] = useState<State>({ url, failed: false, retried: false })

  // A new url starts over (React's "adjust state when a prop changes" pattern, so the
  // stale failure is never painted for the new image).
  let current = state
  if (state.url !== url) {
    current = { url, failed: false, retried: false }
    setState(current)
  }

  const waiting = current.failed && !current.retried
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(
      () => setState(s => (s.url === url ? { url, failed: false, retried: true } : s)),
      IMAGE_RETRY_DELAY_MS + Math.random() * IMAGE_RETRY_JITTER_MS,
    )
    return () => clearTimeout(timer)
  }, [waiting, url])

  return {
    failed: !url || current.failed,
    // A new key remounts the <Image>, which is what makes it request the url again.
    key: current.retried ? 'retry' : 'first',
    onError: () => setState(s => (s.url === url ? { ...s, failed: true } : s)),
  }
}

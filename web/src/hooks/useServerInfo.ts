import { useEffect, useState } from 'react'
import { testServerConnection, type ServerInfo } from '../services/api'
import { useServerStore } from '../stores/server'

// Fetches the connected backend's /info once per server URL and caches it, so the
// footer and Settings can show a live version. Returns null while loading or when
// the server is unreachable — callers render a graceful fallback rather than a
// stuck "Loading" (the failure mode some apps hit by hard-depending on the fetch).
const cache = new Map<string, ServerInfo>()

export function useServerInfo(): ServerInfo | null {
  const base = useServerStore(s => s.serverUrl)
  const [info, setInfo] = useState<ServerInfo | null>(() => cache.get(base) ?? null)

  useEffect(() => {
    const cached = cache.get(base)
    if (cached) {
      setInfo(cached)
      return
    }
    let active = true
    testServerConnection(base).then(result => {
      if (active && result.ok) {
        cache.set(base, result.info)
        setInfo(result.info)
      }
    })
    return () => { active = false }
  }, [base])

  return info
}

import { useServerInfoFor } from '@lyftr/shared'
import { testServerConnection, type ServerInfo } from '../services/api'
import { useServerStore } from '../stores/server'

// Binding only — the fetch, the cache and the staleness note live in @lyftr/shared so
// mobile's login screen reads the same registration state from the same code.
export function useServerInfo(): ServerInfo | null {
  const base = useServerStore(s => s.serverUrl)
  return useServerInfoFor(base, testServerConnection)
}

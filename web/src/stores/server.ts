import { create } from 'zustand'

// Normalize a user-entered server URL to an absolute origin (scheme + host[:port]).
// Returns '' for empty/invalid input, which means "use this site's own origin via
// the reverse proxy" — the zero-config default. Without this, a scheme-less value
// like "192.168.1.10:3000" is treated by the browser as a relative path and folded
// into the frontend origin (the cause of the bogus POST /host:port/... 405s).
export const normalizeServerUrl = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/\s/.test(trimmed)) return '' // a server URL never contains whitespace
  // Default the scheme to the page's protocol: on an HTTPS-served app, coercing a
  // bare host to http:// would make the browser block the request as mixed content.
  const pageScheme =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http'
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `${pageScheme}://${trimmed}`
  try {
    const u = new URL(withScheme)
    if (!u.hostname) return ''
    return `${u.protocol}//${u.host}`
  } catch {
    return ''
  }
}

interface ServerStore {
  serverUrl: string // '' = same origin (reverse proxy)
  setServerUrl: (url: string) => void
  getServerUrl: () => string
}

export const useServerStore = create<ServerStore>((set, get) => ({
  serverUrl: localStorage.getItem('server_url') || '',

  setServerUrl: (url: string) => {
    const normalized = normalizeServerUrl(url)
    if (normalized) localStorage.setItem('server_url', normalized)
    else localStorage.removeItem('server_url')
    set({ serverUrl: normalized })
  },

  getServerUrl: () => get().serverUrl,
}))

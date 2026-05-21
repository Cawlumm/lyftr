import { create } from 'zustand'

// Normalize a user-entered server URL to an absolute origin (scheme + host[:port]).
// Empty input returns '' — "use this site's own origin via the reverse proxy", the
// zero-config default. A non-empty value MUST include an explicit http:// or
// https:// scheme; a bare host ("192.168.1.10:3000"), wrong scheme, or garbage
// returns '' so the caller can reject it with an error. We deliberately do NOT
// guess a scheme: silently prepending one hides typos and can pick the wrong
// protocol (e.g. http on an HTTPS deployment), so the user must be explicit.
export const normalizeServerUrl = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/\s/.test(trimmed)) return ''             // a server URL never contains whitespace
  if (!/^https?:\/\//i.test(trimmed)) return '' // require an explicit http:// or https://
  try {
    const u = new URL(trimmed)
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

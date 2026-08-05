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

// Loopback never leaves the machine, so http:// to it carries none of the on-network
// exposure below. Everything else on http:// does.
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i

// True when this server URL sends traffic unencrypted over a network. On plain http://
// every request carries the `Authorization: Bearer` token in the clear and the refresh
// token crosses the wire on login, so anyone sharing the network can capture a credential
// that stays valid until it expires — there is no revocation list.
//
// Mirrors isInsecureServerUrl in @lyftr/shared; the two converge when web moves onto the
// shared package (#67).
export const isInsecureServerUrl = (serverUrl: string): boolean => {
  if (!serverUrl) return false // '' = same origin, not a user choice
  try {
    const u = new URL(serverUrl)
    return u.protocol === 'http:' && !LOOPBACK.test(u.hostname)
  } catch {
    return false
  }
}

export const INSECURE_SERVER_WARNING =
  'Not encrypted — anyone on this network can read your login and stay signed in as you. Use https:// if you can.'

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

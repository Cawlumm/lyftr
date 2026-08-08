// Normalize a user-entered server URL to an absolute origin (scheme + host[:port]).
// Empty input returns '' — "use the default backend". A non-empty value MUST include
// an explicit http:// or https:// scheme; a bare host, wrong scheme, or garbage
// returns '' so the caller can reject it. We deliberately do NOT guess a scheme:
// silently prepending one hides typos and can pick the wrong protocol.
//
// NOTE: uses the global `URL`. In React Native, import 'react-native-url-polyfill/auto'
// once at app entry so `new URL()` is available (Hermes lacks a complete URL by default).
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

// Loopback never leaves the device (or, on web, the machine), so http:// to it carries
// none of the on-network exposure below. Everything else on http:// does.
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i

// True when this server URL sends traffic unencrypted over a network: every request
// carries the `Authorization: Bearer` token in the clear and the refresh token crosses
// the wire on login, so anyone sharing the network can capture a credential that stays
// valid until it expires — the backend has no revocation list.
//
// Android blocks cleartext by default; Lyftr opts back in so a LAN install works at all
// (#79), which is why the app has to surface this itself — the platform no longer does.
//
// Pass the *saved* server URL, not an input buffer: a half-typed "http" would otherwise
// flash a warning while the user is still typing.
// One wording for every surface (login server row, Settings, web) so the risk reads the
// same wherever it appears. Names the concrete consequence rather than "not secure" —
// a vague warning is the kind users learn to scroll past.
export const INSECURE_SERVER_WARNING =
  'Not encrypted — anyone on this network can read your login and stay signed in as you. Use https:// if you can.'

export const isInsecureServerUrl = (serverUrl: string): boolean => {
  if (!serverUrl) return false // '' = same-origin/default backend, not a user choice
  try {
    const u = new URL(serverUrl)
    return u.protocol === 'http:' && !LOOPBACK.test(u.hostname)
  } catch {
    return false
  }
}

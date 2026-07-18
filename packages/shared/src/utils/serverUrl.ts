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

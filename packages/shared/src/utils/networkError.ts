// Classifies transport-level failures (no HTTP response) into something actionable.
//
// Why this exists: axios reports every response-less failure identically. RN's XHR
// dispatches a bare `new Event('error')` with no `.message`, and axios falls back to the
// literal string 'Network Error' with code ERR_NETWORK (axios/lib/adapters/xhr.js). So a
// blocked-cleartext request, an untrusted certificate, a refused connection and a DNS
// failure are indistinguishable from `err.message` alone — which is how a self-hosted
// user hit two different native blocks and got told to check CORS (issue #79).

export type NetworkFailure =
  | 'cleartext-blocked'
  | 'certificate-untrusted'
  | 'hostname-mismatch'
  | 'timeout'
  | 'unreachable'
  | 'unknown'

// React Native stashes the real native error on the XHR: RCTNetworking passes Android's
// Throwable.getMessage() / iOS's NSError.localizedDescription into __didCompleteResponse,
// which assigns it to `_response` and sets `_hasError`. Read `_response`/`responseText`
// and NEVER `response` — the `response` getter returns '' once `_hasError` is set
// (react-native/Libraries/Network/XMLHttpRequest.js). On web this is always empty.
export const nativeErrorDetail = (err: any): string => {
  const xhr = err?.request
  if (!xhr) return ''
  try {
    return String(xhr._response ?? xhr.responseText ?? '').trim()
  } catch {
    // responseText throws unless responseType is '' or 'text'.
    return ''
  }
}

// Ordered most-specific first: a hostname mismatch and a missing trust anchor are both
// SSL failures, so the narrow patterns have to win before the generic SSL ones.
const PATTERNS: ReadonlyArray<[RegExp, NetworkFailure]> = [
  // React Native reports a timed-out request as the bare string 'timeout' on the XHR,
  // and does NOT reliably set _timedOut or axios's ECONNABORTED the way the web adapter
  // does - observed on Android against a black-holed refresh POST (#145), where this fell
  // through to the generic copy with '(timeout)' tacked on the end. The word that matters
  // to the user is that the server was too slow, not that the URL might be wrong.
  [/^timeout$/i, 'timeout'],
  [/CLEARTEXT communication to .* not permitted/i, 'cleartext-blocked'],
  [/App Transport Security policy requires the use of a secure connection/i, 'cleartext-blocked'],
  [/Hostname .* not verified/i, 'hostname-mismatch'],
  [/Trust anchor for certification path not found/i, 'certificate-untrusted'],
  [/CertPathValidatorException|SSLHandshakeException/i, 'certificate-untrusted'],
  [/certificate for this server is invalid/i, 'certificate-untrusted'],
  [/An SSL error has occurred/i, 'certificate-untrusted'],
  [/Failed to connect to|Could not connect to the server|ECONNREFUSED/i, 'unreachable'],
]

export const classifyNetworkError = (err: any): NetworkFailure => {
  // A response means the request completed; this is an HTTP-level problem, not transport.
  if (err?.response) return 'unknown'
  if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') return 'timeout'
  if (err?.request?._timedOut) return 'timeout'

  const detail = nativeErrorDetail(err)
  if (!detail) return 'unknown'

  for (const [pattern, verdict] of PATTERNS) {
    if (pattern.test(detail)) return verdict
  }
  return 'unknown'
}

// CORS is a browser concept — a native app sends no Origin header, so the backend never
// evaluates it. Mentioning it on mobile sends self-hosters chasing a non-existent problem.
const isWeb = (): boolean => typeof document !== 'undefined'

// The same failure has to be said two different ways, because it is read in two very
// different moments.
//
// 'full' is for someone who is configuring a server and wants the fix: the sign-in
// screen and the Server-settings probe. Those explanations are long on purpose - they
// carry hard-won detail about cleartext policy and CA trust that a self-hoster cannot
// get anywhere else.
//
// 'brief' is for someone who is USING the app and just tapped a button. Mid-set, the
// certificate explanation is 313 characters - eight lines inside a Finish Workout sheet,
// pushing the buttons toward the fold - to tell them something they cannot act on until
// they are off the gym floor anyway. It says what happened and where the fix lives, and
// stops. NN/g's error guidance and progressive disclosure both land here: the most
// important information first, the details where they are actionable.
export type MessageDetail = 'brief' | 'full'

// Each one names the cause and, where the fix is somewhere the user can go, points at it.
// A short message that offers no way forward is not brief, it is unhelpful.
const BRIEF: Record<NetworkFailure, string> = {
  'cleartext-blocked': 'Blocked because the server URL uses http://. Check Server settings.',
  'certificate-untrusted': "The server's certificate isn't trusted by this device. Check Server settings.",
  'hostname-mismatch': "The server's certificate doesn't cover this address. Check Server settings.",
  timeout: "The server didn't respond in time. Try again in a moment.",
  unreachable: "Couldn't reach the server. Check that it's running.",
  // No raw native string here: in full it is diagnostic gold, in a sheet it is noise.
  unknown: "Can't reach the server right now.",
}

export const networkFailureMessage = (err: any, detail: MessageDetail = 'brief'): string => {
  if (detail === 'brief') return BRIEF[classifyNetworkError(err)]
  switch (classifyNetworkError(err)) {
    // Deliberately does NOT say "update the app". This build already permits cleartext, so
    // if the OS still blocked it the cause is something an update can't fix — most likely
    // iOS, where NSAllowsLocalNetworking covers LAN IPs, `.local` and unqualified names but
    // NOT a custom TLD like `.lan`. Promising an update would send that user in circles.
    case 'cleartext-blocked':
      return 'This device blocked the connection because the URL uses plain http://. Switch the server to https:// — a reverse proxy can issue a certificate for a LAN-only hostname with no ports open.'
    // Leads with the real-certificate path on purpose. Installing a CA is a device-wide
    // action — it affects every app that trusts the user store, not just Lyftr — so it is
    // offered as the fallback it is, not as the headline fix.
    case 'certificate-untrusted':
      return "The server's certificate isn't trusted by this device. Best fix: give the server a real certificate — a reverse proxy can issue one for a LAN-only hostname with no ports open. Or install your own CA under Settings → Security → Encryption & credentials, which trusts it for every app on the device, not just Lyftr."
    case 'hostname-mismatch':
      return "The server's certificate doesn't cover this address. Reissue it with this hostname or IP listed in the certificate's Subject Alternative Name (SAN)."
    case 'timeout':
      return "The server didn't respond in time. Check that it's running and reachable from this device."
    case 'unreachable':
      return "Couldn't connect to the server. Check the URL and that the backend is running."
    default: {
      const base = isWeb()
        ? "Can't reach the server. Check the URL, that the backend is running, and that it allows this app's origin (CORS)."
        : "Can't reach the server. Check the URL and that the backend is running and reachable from this device."
      // Surface the raw native reason rather than guessing: an unmatched string is exactly
      // the case where our copy would otherwise be confidently wrong.
      const detail = nativeErrorDetail(err)
      return detail ? `${base} (${detail})` : base
    }
  }
}

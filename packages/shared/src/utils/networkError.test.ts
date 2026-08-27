import { classifyNetworkError, nativeErrorDetail, networkFailureMessage } from './networkError'

// Builds the shape axios actually produces on React Native: message is always the literal
// 'Network Error' (RN dispatches a bare Event with no .message), and the real reason is
// only on the XHR's `_response`. See networkError.ts for the source references.
const rnError = (nativeMessage: string) => ({
  message: 'Network Error',
  code: 'ERR_NETWORK',
  request: { _response: nativeMessage, responseType: '' },
})

describe('classifyNetworkError', () => {
  // Exact strings observed from OkHttp / NSURLError. Host names are interpolated by the
  // platform, so the matchers must tolerate any host.
  const cases: Array<[string, string, string]> = [
    [
      'android cleartext',
      'CLEARTEXT communication to 10.0.2.2 not permitted by network security policy',
      'cleartext-blocked',
    ],
    [
      'ios ATS',
      'The resource could not be loaded because the App Transport Security policy requires the use of a secure connection.',
      'cleartext-blocked',
    ],
    [
      'android untrusted CA',
      'java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.',
      'certificate-untrusted',
    ],
    [
      'ios invalid certificate',
      'The certificate for this server is invalid. You might be connecting to a server that is pretending to be “10.0.2.2” which could put your confidential information at risk.',
      'certificate-untrusted',
    ],
    ['ios generic TLS', 'An SSL error has occurred and a secure connection to the server cannot be made.', 'certificate-untrusted'],
    [
      'android hostname mismatch',
      'Hostname 10.0.2.2 not verified:\n    certificate: sha256/abc=\n    DN: CN=lyftr.lan\n    subjectAltNames: [lyftr.lan]',
      'hostname-mismatch',
    ],
    ['android connection refused', 'Failed to connect to /10.0.2.2:3000', 'unreachable'],
    ['ios connection refused', 'Could not connect to the server.', 'unreachable'],
  ]

  it.each(cases)('classifies %s', (_name, native, expected) => {
    expect(classifyNetworkError(rnError(native))).toBe(expected)
  })

  // A hostname mismatch is also an SSL failure, so ordering must not let the generic
  // certificate patterns swallow it.
  it('prefers hostname-mismatch over the generic certificate verdicts', () => {
    const native = 'Hostname 10.0.2.2 not verified: SSLHandshakeException'
    expect(classifyNetworkError(rnError(native))).toBe('hostname-mismatch')
  })

  it('reports a timeout from the axios code', () => {
    expect(classifyNetworkError({ code: 'ECONNABORTED', message: 'timeout of 8000ms exceeded' })).toBe('timeout')
  })

  // The shape Android actually produced when a refresh POST was black-holed: no axios
  // code, no _timedOut, just the native word on the XHR.
  it('reports a timeout that only the native detail names', () => {
    expect(classifyNetworkError({ request: { _response: 'timeout' } })).toBe('timeout')
  })

  it('reports a timeout flagged on the XHR', () => {
    expect(classifyNetworkError({ code: 'ERR_NETWORK', request: { _timedOut: true } })).toBe('timeout')
  })

  it('treats an HTTP response as not-a-transport-failure', () => {
    expect(classifyNetworkError({ response: { status: 500, data: {} } })).toBe('unknown')
  })

  it('falls back to unknown with no request (web axios)', () => {
    expect(classifyNetworkError({ message: 'Network Error', code: 'ERR_NETWORK' })).toBe('unknown')
  })

  it('falls back to unknown on an unrecognised native string', () => {
    expect(classifyNetworkError(rnError('something nobody has seen before'))).toBe('unknown')
  })
})

describe('nativeErrorDetail', () => {
  it('reads _response', () => {
    expect(nativeErrorDetail(rnError('boom'))).toBe('boom')
  })

  // The `response` getter returns '' once _hasError is set, so reading it instead of
  // `_response` would silently lose every native reason.
  it('ignores the wiped `response` getter and prefers _response', () => {
    const err = { request: { _response: 'real reason', response: '', responseType: '' } }
    expect(nativeErrorDetail(err)).toBe('real reason')
  })

  it('returns empty when responseText throws for a non-text responseType', () => {
    const err = {
      request: {
        get responseText(): string {
          throw new Error("responseText is only available if responseType is '' or 'text'")
        },
      },
    }
    expect(nativeErrorDetail(err)).toBe('')
  })

  it('returns empty with no request', () => {
    expect(nativeErrorDetail({ message: 'Network Error' })).toBe('')
  })
})

describe('networkFailureMessage', () => {
  it('never blames CORS on a native transport failure', () => {
    const msg = networkFailureMessage(
      rnError('CLEARTEXT communication to 10.0.2.2 not permitted by network security policy'),
    )
    expect(msg).not.toMatch(/CORS/)
    expect(msg).toMatch(/http:\/\//)
  })

  it('tells a private-CA user how to install their certificate', () => {
    const msg = networkFailureMessage(rnError('Trust anchor for certification path not found.'))
    expect(msg).toMatch(/certificate/i)
    expect(msg).toMatch(/Encryption & credentials/)
  })

  it('appends the raw native reason when it matches nothing, rather than guessing', () => {
    const msg = networkFailureMessage(rnError('brand new platform error'))
    expect(msg).toContain('brand new platform error')
  })

  // testEnvironment is 'node', so `document` is undefined — the native wording applies.
  it('omits the CORS hint when there is no document (native)', () => {
    expect(networkFailureMessage({ message: 'Network Error', request: {} })).not.toMatch(/CORS/)
  })
})

import { normalizeServerUrl, isInsecureServerUrl } from './serverUrl'

describe('normalizeServerUrl', () => {
  it('empty input -> empty (default backend)', () => {
    expect(normalizeServerUrl('')).toBe('')
    expect(normalizeServerUrl('   ')).toBe('')
  })

  it('keeps a valid absolute origin and strips the path', () => {
    expect(normalizeServerUrl('http://192.168.1.10:3000')).toBe('http://192.168.1.10:3000')
    expect(normalizeServerUrl('https://lyftr.example.com/api/v1')).toBe('https://lyftr.example.com')
  })

  it('rejects scheme-less / whitespace / garbage', () => {
    expect(normalizeServerUrl('192.168.1.10:3000')).toBe('') // no scheme
    expect(normalizeServerUrl('ftp://x')).toBe('')            // wrong scheme
    expect(normalizeServerUrl('has space')).toBe('')
  })
})

describe('isInsecureServerUrl', () => {
  it('flags plain http:// to a network address', () => {
    expect(isInsecureServerUrl('http://192.168.1.10:8080')).toBe(true)
    expect(isInsecureServerUrl('http://lyftr.lan')).toBe(true)
    expect(isInsecureServerUrl('http://10.0.2.2:3000')).toBe(true)
  })

  it('does not flag https://', () => {
    expect(isInsecureServerUrl('https://lyftr.example.com')).toBe(false)
    expect(isInsecureServerUrl('https://192.168.1.10:8443')).toBe(false)
  })

  // Loopback traffic never reaches a network, so there is nobody to intercept it.
  it('does not flag loopback over http', () => {
    expect(isInsecureServerUrl('http://localhost:3000')).toBe(false)
    expect(isInsecureServerUrl('http://127.0.0.1:3000')).toBe(false)
    expect(isInsecureServerUrl('http://[::1]:3000')).toBe(false)
  })

  // A hostname that merely starts with "localhost" is a different host entirely.
  it('flags lookalike hostnames', () => {
    expect(isInsecureServerUrl('http://localhost.evil.com')).toBe(true)
    expect(isInsecureServerUrl('http://127.0.0.1.evil.com')).toBe(true)
  })

  it('empty (default backend) and garbage are not flagged', () => {
    expect(isInsecureServerUrl('')).toBe(false)
    expect(isInsecureServerUrl('not a url')).toBe(false)
  })
})

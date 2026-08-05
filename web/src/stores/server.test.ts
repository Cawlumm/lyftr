import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  normalizeServerUrl,
  useServerStore,
  isInsecureServerUrl,
  isMixedContentBlocked,
} from './server'

describe('normalizeServerUrl', () => {
  it('returns empty for blank or whitespace-only input', () => {
    expect(normalizeServerUrl('')).toBe('')
    expect(normalizeServerUrl('   ')).toBe('')
  })

  it('rejects input with internal whitespace', () => {
    expect(normalizeServerUrl('not a url')).toBe('')
    expect(normalizeServerUrl('http://foo bar')).toBe('')
  })

  it('rejects a scheme-less host (no scheme is guessed)', () => {
    expect(normalizeServerUrl('192.168.1.10:3000')).toBe('')
    expect(normalizeServerUrl('example.com')).toBe('')
  })

  it('preserves an explicit http:// or https:// scheme', () => {
    expect(normalizeServerUrl('https://example.com')).toBe('https://example.com')
    expect(normalizeServerUrl('http://example.com')).toBe('http://example.com')
  })

  it('reduces to scheme + host, dropping path, query and trailing slash', () => {
    expect(normalizeServerUrl('http://example.com/api/')).toBe('http://example.com')
    expect(normalizeServerUrl('https://example.com:8443/x?y=1')).toBe('https://example.com:8443')
  })

  it('returns empty for unparseable input', () => {
    expect(normalizeServerUrl('http://')).toBe('')
    expect(normalizeServerUrl(':::')).toBe('')
  })
})

describe('useServerStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useServerStore.setState({ serverUrl: '' })
  })

  it('persists a normalized absolute origin to localStorage', () => {
    useServerStore.getState().setServerUrl('http://192.168.1.10:3000')
    expect(useServerStore.getState().serverUrl).toBe('http://192.168.1.10:3000')
    expect(localStorage.getItem('server_url')).toBe('http://192.168.1.10:3000')
  })

  it('does not persist a scheme-less host (rejected, stays on reverse proxy)', () => {
    useServerStore.getState().setServerUrl('192.168.1.10:3000')
    expect(useServerStore.getState().serverUrl).toBe('')
    expect(localStorage.getItem('server_url')).toBeNull()
  })

  it('clears the stored URL when set to empty (back to reverse proxy)', () => {
    useServerStore.getState().setServerUrl('http://x:3000')
    useServerStore.getState().setServerUrl('')
    expect(useServerStore.getState().serverUrl).toBe('')
    expect(localStorage.getItem('server_url')).toBeNull()
  })

  it('does not persist invalid input', () => {
    useServerStore.getState().setServerUrl('has spaces')
    expect(useServerStore.getState().serverUrl).toBe('')
    expect(localStorage.getItem('server_url')).toBeNull()
  })

  it('getServerUrl reflects the current value', () => {
    useServerStore.getState().setServerUrl('https://example.com')
    expect(useServerStore.getState().getServerUrl()).toBe('https://example.com')
  })
})

describe('isInsecureServerUrl', () => {
  it('flags plain http:// to a network address', () => {
    expect(isInsecureServerUrl('http://192.168.1.10:8080')).toBe(true)
    expect(isInsecureServerUrl('http://lyftr.lan')).toBe(true)
  })

  it('does not flag https://', () => {
    expect(isInsecureServerUrl('https://lyftr.example.com')).toBe(false)
  })

  // Loopback traffic never reaches a network, so there is nobody to intercept it.
  it('does not flag loopback over http', () => {
    expect(isInsecureServerUrl('http://localhost:3000')).toBe(false)
    expect(isInsecureServerUrl('http://127.0.0.1:3000')).toBe(false)
    expect(isInsecureServerUrl('http://[::1]:3000')).toBe(false)
  })

  // A host that merely starts with "localhost" is a different host entirely.
  it('flags lookalike hostnames', () => {
    expect(isInsecureServerUrl('http://localhost.evil.com')).toBe(true)
    expect(isInsecureServerUrl('http://127.0.0.1.evil.com')).toBe(true)
  })

  it('empty (same origin) and garbage are not flagged', () => {
    expect(isInsecureServerUrl('')).toBe(false)
    expect(isInsecureServerUrl('not a url')).toBe(false)
  })
})

describe('isMixedContentBlocked', () => {
  const setPageProtocol = (protocol: 'http:' | 'https:') => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, protocol },
      writable: true,
      configurable: true,
    })
  }
  const original = window.location
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
  })

  it('blocks http:// server from an https:// page', () => {
    setPageProtocol('https:')
    expect(isMixedContentBlocked('http://192.168.1.10:8080')).toBe(true)
    expect(isMixedContentBlocked('http://lyftr.lan')).toBe(true)
  })

  // Loopback is "potentially trustworthy", so mixed-content checks let it through.
  it('allows loopback over http even from an https:// page', () => {
    setPageProtocol('https:')
    expect(isMixedContentBlocked('http://localhost:3000')).toBe(false)
    expect(isMixedContentBlocked('http://127.0.0.1:3000')).toBe(false)
    expect(isMixedContentBlocked('http://[::1]:3000')).toBe(false)
  })

  it('allows https:// server from an https:// page', () => {
    setPageProtocol('https:')
    expect(isMixedContentBlocked('https://lyftr.example.com')).toBe(false)
  })

  // Upgrading from an http page to an https server is never mixed content.
  it('never blocks from an http:// page', () => {
    setPageProtocol('http:')
    expect(isMixedContentBlocked('http://192.168.1.10:8080')).toBe(false)
    expect(isMixedContentBlocked('https://lyftr.example.com')).toBe(false)
  })

  it('empty (same origin) and garbage are never blocked', () => {
    setPageProtocol('https:')
    expect(isMixedContentBlocked('')).toBe(false)
    expect(isMixedContentBlocked('not a url')).toBe(false)
  })
})

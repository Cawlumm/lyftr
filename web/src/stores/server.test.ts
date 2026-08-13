import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useServerStore, isMixedContentBlocked } from './server'

// Scoped to what is genuinely web's after the store moved to @lyftr/shared:
//
//  - isMixedContentBlocked reads window.location.protocol, so it can only be
//    exercised in a DOM. Shared's jest runs in plain node, where the branch under
//    test is unreachable — the function returns false before it looks at anything.
//  - The store binding: that the shared factory, wired to web's localStorage
//    adapter, really reads and writes the browser's localStorage under the expected
//    key. Shared tests the reducer against an in-memory adapter; only here can the
//    adapter itself be wrong.
//
// normalizeServerUrl / isInsecureServerUrl are pure and now live in
// packages/shared/src/utils/serverUrl.test.ts.

describe('useServerStore — localStorage binding', () => {
  beforeEach(async () => {
    localStorage.clear()
    useServerStore.setState({ serverUrl: '' })
  })

  it('persists a normalized absolute origin to the browser localStorage', async () => {
    await useServerStore.getState().setServerUrl('http://192.168.1.10:3000')
    expect(useServerStore.getState().serverUrl).toBe('http://192.168.1.10:3000')
    expect(localStorage.getItem('server_url')).toBe('http://192.168.1.10:3000')
  })

  it('does not persist a scheme-less host (rejected, stays on the reverse proxy)', async () => {
    await useServerStore.getState().setServerUrl('192.168.1.10:3000')
    expect(useServerStore.getState().serverUrl).toBe('')
    expect(localStorage.getItem('server_url')).toBeNull()
  })

  it('clears the stored URL when set to empty (back to the reverse proxy)', async () => {
    await useServerStore.getState().setServerUrl('https://lyftr.example.com')
    expect(localStorage.getItem('server_url')).toBe('https://lyftr.example.com')
    await useServerStore.getState().setServerUrl('')
    expect(useServerStore.getState().serverUrl).toBe('')
    expect(localStorage.getItem('server_url')).toBeNull()
  })

  it('hydrate() reads a URL written by a previous session', async () => {
    // The upgrade path: the key is unchanged, so an existing install keeps its server.
    localStorage.setItem('server_url', 'https://lyftr.example.com')
    useServerStore.setState({ serverUrl: '', isHydrated: false })
    await useServerStore.getState().hydrate()
    expect(useServerStore.getState().serverUrl).toBe('https://lyftr.example.com')
    expect(useServerStore.getState().isHydrated).toBe(true)
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

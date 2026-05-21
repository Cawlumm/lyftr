import { describe, it, expect, beforeEach } from 'vitest'
import { normalizeServerUrl, useServerStore } from './server'

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

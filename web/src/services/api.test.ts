import { describe, it, expect } from 'vitest'
import { apiUrl, apiErrorMessage } from './api'

describe('apiUrl', () => {
  it('builds the same-origin path when no origin is given', () => {
    expect(apiUrl()).toBe('/api/v1')
  })

  it('prefixes an absolute origin', () => {
    expect(apiUrl('http://localhost:3000')).toBe('http://localhost:3000/api/v1')
  })
})

describe('apiErrorMessage', () => {
  it('passes through a structured server error', () => {
    const msg = apiErrorMessage(
      { response: { status: 401, data: { error: 'Invalid email or password' } } },
      'fallback',
    )
    expect(msg).toBe('Invalid email or password')
  })

  it('flags 404/405 as a misconfigured server URL', () => {
    expect(apiErrorMessage({ response: { status: 404, data: {} } }, 'fallback')).toMatch(/misconfigured/i)
    expect(apiErrorMessage({ response: { status: 405, data: {} } }, 'fallback')).toMatch(/misconfigured/i)
  })

  // 502/503/504 are the reverse proxy talking, not the backend: it accepted the
  // connection and could not reach the app behind it. "Server error" was true but
  // unhelpful — the answer is to wait, not to change anything.
  it('reads a gateway status as a restart, not a generic server error', () => {
    for (const status of [502, 503, 504]) {
      expect(apiErrorMessage({ response: { status, data: {} } }, 'fallback')).toMatch(/restarting or unreachable/i)
    }
  })

  // Every reverse proxy serves its 502 as an HTML page, so a body sniff that ran first
  // diagnosed a restarting backend as "you typed the wrong address".
  it('reads an HTML-bodied 502 as a restart, not as a wrong address', () => {
    const html = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>'
    expect(apiErrorMessage({ response: { status: 502, data: html } }, 'fallback')).toMatch(/restarting or unreachable/i)
  })

  it('still maps a plain 500 to a server error', () => {
    expect(apiErrorMessage({ response: { status: 500, data: {} } }, 'fallback')).toMatch(/server error/i)
  })

  it('uses the fallback for other responses without a server error', () => {
    expect(apiErrorMessage({ response: { status: 400, data: {} } }, 'fallback')).toBe('fallback')
  })

  it('reports a connectivity problem when there is no response', () => {
    expect(apiErrorMessage({ request: {} }, 'fallback')).toMatch(/can't reach the server/i)
    expect(apiErrorMessage(new Error('Network Error'), 'fallback')).toMatch(/can't reach the server/i)
  })
})

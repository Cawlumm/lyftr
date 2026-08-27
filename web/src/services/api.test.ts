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

  // A proxy saying the backend is not answering IT is worth retrying in a moment; our own
  // code failing will fail the same way until someone reads the logs. Self-hosted stacks
  // produce the first one on every `docker compose up -d`.
  it('tells a restarting proxy apart from our own code failing', () => {
    for (const status of [502, 503, 504]) {
      expect(apiErrorMessage({ response: { status, data: {} } }, 'fallback')).toMatch(/restarting or unreachable/i)
    }
    expect(apiErrorMessage({ response: { status: 500, data: {} } }, 'fallback')).toMatch(/server error/i)
  })

  it('names an HTML page for what it is, rather than blaming the app', () => {
    const html = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>'
    const msg = apiErrorMessage({ response: { status: 502, data: html } }, 'Failed to save')
    expect(msg).toMatch(/web page/i)
    expect(msg).not.toBe('Failed to save')
  })

  it('uses the fallback for other responses without a server error', () => {
    expect(apiErrorMessage({ response: { status: 400, data: {} } }, 'fallback')).toBe('fallback')
  })

  it('reports a connectivity problem when there is no response', () => {
    expect(apiErrorMessage({ request: {} }, 'fallback')).toMatch(/can't reach the server/i)
    expect(apiErrorMessage(new Error('Network Error'), 'fallback')).toMatch(/can't reach the server/i)
  })
})

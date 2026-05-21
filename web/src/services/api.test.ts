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

  it('maps 5xx to a server error', () => {
    expect(apiErrorMessage({ response: { status: 503, data: {} } }, 'fallback')).toMatch(/server error/i)
  })

  it('uses the fallback for other responses without a server error', () => {
    expect(apiErrorMessage({ response: { status: 400, data: {} } }, 'fallback')).toBe('fallback')
  })

  it('reports a connectivity problem when there is no response', () => {
    expect(apiErrorMessage({ request: {} }, 'fallback')).toMatch(/can't reach the server/i)
    expect(apiErrorMessage(new Error('Network Error'), 'fallback')).toMatch(/can't reach the server/i)
  })
})

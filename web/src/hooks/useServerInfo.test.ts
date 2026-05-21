import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../services/api', () => ({
  testServerConnection: vi.fn(),
}))

import { testServerConnection } from '../services/api'
import { useServerInfo } from './useServerInfo'
import { useServerStore } from '../stores/server'

const mockTest = vi.mocked(testServerConnection)

// Each test uses a distinct server URL so the hook's module-level cache (keyed by
// URL) never bleeds between cases.
describe('useServerInfo', () => {
  beforeEach(() => mockTest.mockReset())

  it('starts null and resolves to the server info on success', async () => {
    useServerStore.setState({ serverUrl: 'http://success-server' })
    mockTest.mockResolvedValue({ ok: true, info: { name: 'lyftr', version: '1.2.3' } })

    const { result } = renderHook(() => useServerInfo())
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toEqual({ name: 'lyftr', version: '1.2.3' }))
  })

  it('stays null when the server is unreachable', async () => {
    useServerStore.setState({ serverUrl: 'http://unreachable-server' })
    mockTest.mockResolvedValue({ ok: false, message: "Can't reach the server." })

    const { result } = renderHook(() => useServerInfo())
    await waitFor(() => expect(mockTest).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('caches per server URL and does not refetch on remount', async () => {
    useServerStore.setState({ serverUrl: 'http://cached-server' })
    mockTest.mockResolvedValue({ ok: true, info: { name: 'lyftr', version: '9.9.9' } })

    const first = renderHook(() => useServerInfo())
    await waitFor(() => expect(first.result.current).toEqual({ name: 'lyftr', version: '9.9.9' }))
    expect(mockTest).toHaveBeenCalledTimes(1)

    const second = renderHook(() => useServerInfo())
    expect(second.result.current).toEqual({ name: 'lyftr', version: '9.9.9' }) // served from cache
    expect(mockTest).toHaveBeenCalledTimes(1) // no second call
  })
})

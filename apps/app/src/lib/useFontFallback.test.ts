import { act, renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { FONT_TIMEOUT_MS, useFontFallback } from './useFontFallback'

describe('useFontFallback', () => {
  const os = Platform.OS
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    Platform.OS = os
  })

  it('on web, gives up on stalled fonts after the timeout', async () => {
    Platform.OS = 'web'
    const { result } = await renderHook(() => useFontFallback(false))
    expect(result.current).toBe(false)
    await act(async () => { jest.advanceTimersByTime(FONT_TIMEOUT_MS) })
    expect(result.current).toBe(true)
  })

  it('on native, waits for the fonts however long they take', async () => {
    Platform.OS = 'ios'
    const { result } = await renderHook(() => useFontFallback(false))
    await act(async () => { jest.advanceTimersByTime(FONT_TIMEOUT_MS * 10) })
    expect(result.current).toBe(false)
  })

  it('is ready as soon as the fonts load', async () => {
    Platform.OS = 'web'
    const { result } = await renderHook(() => useFontFallback(true))
    expect(result.current).toBe(true)
  })
})

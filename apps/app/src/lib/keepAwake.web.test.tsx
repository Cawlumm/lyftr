import { act, renderHook } from '@testing-library/react-native'
import { useSessionKeepAwake } from './keepAwake.web'

// Imported by path: the default (native) jest project resolves keepAwake.ts for the bare name.
// That project is a node environment (jsdom clashes with the RN jest setup), so the three
// browser globals the hook reads are stubbed here.
const doc = new EventTarget() as EventTarget & { visibilityState: string }
Object.defineProperty(globalThis, 'document', { configurable: true, value: doc })
const win = globalThis as unknown as { isSecureContext: boolean }
const nav: { wakeLock?: unknown } = {}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav })

function setVisibility(state: 'visible' | 'hidden') {
  doc.visibilityState = state
}

function mockWakeLock() {
  const sentinels: { released: boolean; release: jest.Mock }[] = []
  const request = jest.fn(async () => {
    const s = { released: false, release: jest.fn(async function (this: any) { s.released = true }) }
    sentinels.push(s)
    return s
  })
  nav.wakeLock = { request }
  return { request, sentinels }
}

describe('useSessionKeepAwake (web)', () => {
  beforeEach(() => {
    setVisibility('visible')
    win.isSecureContext = true
  })
  afterEach(() => { delete nav.wakeLock })

  it('requests on start, re-requests once visible again, releases on end', async () => {
    const { request, sentinels } = mockWakeLock()
    const { result, rerender } = await renderHook(({ on }: { on: boolean }) => useSessionKeepAwake(on), { initialProps: { on: true } })
    expect(request).toHaveBeenCalledTimes(1)
    expect(result.current).toBe(false)

    // Browsers release the lock when the tab is hidden.
    sentinels[0].released = true
    await act(async () => { setVisibility('hidden'); doc.dispatchEvent(new Event('visibilitychange')) })
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => { setVisibility('visible'); doc.dispatchEvent(new Event('visibilitychange')) })
    expect(request).toHaveBeenCalledTimes(2)

    await rerender({ on: false })
    expect(sentinels[1].release).toHaveBeenCalled()
    await act(async () => { doc.dispatchEvent(new Event('visibilitychange')) })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('reports unsupported over an insecure context without touching the API', async () => {
    const { request } = mockWakeLock()
    win.isSecureContext = false
    const { result } = await renderHook(() => useSessionKeepAwake(true))
    expect(result.current).toBe(true)
    expect(request).not.toHaveBeenCalled()
  })

  it('reports unsupported when the API is missing', async () => {
    const { result } = await renderHook(() => useSessionKeepAwake(true))
    expect(result.current).toBe(true)
  })

  it('swallows a refused request', async () => {
    const { request } = mockWakeLock()
    request.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
    const { result } = await renderHook(() => useSessionKeepAwake(true))
    expect(result.current).toBe(false)
  })
})

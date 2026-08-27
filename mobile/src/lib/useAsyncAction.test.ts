import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useAsyncAction } from '@lyftr/shared'

// The hook lives in @lyftr/shared, but its test lives here: `packages/shared` is plain
// ts-jest with no renderer, and adding one for this would be a dependency the repo does
// not need. Mobile already has @testing-library/react-native, and mobile is where the
// forty call sites this replaces mostly are.

const httpError = (status: number, body: any = {}) => {
  const err: any = new Error(`Request failed with status code ${status}`)
  err.response = { status, data: body, statusText: '', headers: {}, config: {} }
  return err
}

// No `response` at all — the shape a timeout or a dropped connection arrives in, and the
// one every hand-rolled `err.response.data.error` read fell through on.
const silence = () => {
  const err: any = new Error('timeout of 20000ms exceeded')
  err.code = 'ECONNABORTED'
  return err
}

describe('useAsyncAction', () => {
  it('reports busy while in flight and clears it after', async () => {
    let release: () => void = () => {}
    const action = jest.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const { result } = renderHook(() => useAsyncAction(action, 'Failed'))

    expect(result.current.busy).toBe(false)
    act(() => { void result.current.run() })
    await waitFor(() => expect(result.current.busy).toBe(true))

    await act(async () => { release() })
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBe('')
  })

  // Clearing in `finally` rather than only on failure: a screen that stays put after
  // succeeding would otherwise read "Saving…" for the rest of its life.
  it('clears busy on success too, not just on failure', async () => {
    const { result } = renderHook(() => useAsyncAction(async () => {}, 'Failed'))

    await act(async () => { await result.current.run() })

    expect(result.current.busy).toBe(false)
  })

  it('resolves true on success and false on failure', async () => {
    const ok = renderHook(() => useAsyncAction(async () => {}, 'Failed'))
    const bad = renderHook(() => useAsyncAction(async () => { throw silence() }, 'Failed'))

    let okResult: boolean | undefined
    let badResult: boolean | undefined
    await act(async () => { okResult = await ok.result.current.run() })
    await act(async () => { badResult = await bad.result.current.run() })

    expect(okResult).toBe(true)
    expect(badResult).toBe(false)
  })

  it('prefers the message the server sent', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw httpError(400, { error: 'name is required' }) }, 'Failed to save'))

    await act(async () => { await result.current.run() })

    expect(result.current.error).toBe('name is required')
  })

  // The whole reason apiErrorMessage lives inside the hook. A raw
  // `err.response.data.error || 'Failed to save'` renders "Failed to save" here, which
  // tells a user on bad wifi nothing about why or whether to try again.
  it('explains a failure that carries no response, instead of falling back', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw silence() }, 'Failed to save'))

    await act(async () => { await result.current.run() })

    expect(result.current.error).not.toBe('Failed to save')
    expect(result.current.error).toMatch(/server/i)
  })

  it('falls back only when the error says nothing useful', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw httpError(400) }, 'Failed to save'))

    await act(async () => { await result.current.run() })

    expect(result.current.error).toBe('Failed to save')
  })

  it('drops a stale message when the next attempt starts', async () => {
    let fail = true
    const { result } = renderHook(() =>
      useAsyncAction(async () => { if (fail) throw silence() }, 'Failed'))

    await act(async () => { await result.current.run() })
    expect(result.current.error).not.toBe('')

    fail = false
    await act(async () => { await result.current.run() })
    expect(result.current.error).toBe('')
  })

  it('drops a stale message on reset, for a sheet being dismissed', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw silence() }, 'Failed'))

    await act(async () => { await result.current.run() })
    expect(result.current.error).not.toBe('')

    act(() => result.current.reset())
    expect(result.current.error).toBe('')
  })

  // `run` is handed to memoized rows and cards, and the screens it lives on re-render
  // every second (the workout timer). If its identity changed with the inline closure
  // it is given, every one of those children would re-render on every tick.
  it('keeps run stable across renders while still calling the newest closure', async () => {
    let calls = 0
    let token = 'first'
    const { result, rerender } = renderHook(
      ({ t }: { t: string }) => useAsyncAction(async () => { calls += 1; token = t }, 'Failed'),
      { initialProps: { t: 'first' } },
    )
    const firstRun = result.current.run

    rerender({ t: 'second' })
    expect(result.current.run).toBe(firstRun)

    await act(async () => { await result.current.run() })
    expect(calls).toBe(1)
    expect(token).toBe('second')
  })

  it('passes its arguments through to the action', async () => {
    const action = jest.fn(async (_id: number, _name: string) => {})
    const { result } = renderHook(() => useAsyncAction(action, 'Failed'))

    await act(async () => { await result.current.run(7, 'squat') })

    expect(action).toHaveBeenCalledWith(7, 'squat')
  })
})

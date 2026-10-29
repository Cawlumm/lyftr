import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useServerList } from '@lyftr/shared'

// Lives here for the same reason useAsyncAction.test.ts does: packages/shared is plain
// ts-jest with no renderer, and mobile already has @testing-library/react-native.
//
// What is pinned is the distinction the hook could not previously make. A failed page
// used to set hasMore=false and nothing else, which renders *identically* to reaching
// the end of the data — so a dropped connection read as "that's all there is", and an
// empty first page read as "you have no workouts" to someone with months of them.

const page = (n: number, size: number) => Array.from({ length: size }, (_, i) => n * size + i)

const timeout = () => {
  const err: any = new Error('timeout of 20000ms exceeded')
  err.code = 'ECONNABORTED'
  return err
}

describe('useServerList — a page that never arrived', () => {
  it('reports why the first page failed instead of looking empty', async () => {
    const fetcher = jest.fn().mockRejectedValue(timeout())

    const { result } = await renderHook(() => useServerList<number>({ fetcher, pageSize: 2 }))

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.items).toEqual([])
    // The fallback would be wrong here — a timeout has no response body, and the whole
    // point is that the screen can tell this apart from a genuinely empty list.
    expect(result.current.error).toBe("The server didn't respond in time. Try again in a moment.")
  })

  it('keeps the pages that did arrive when a later one fails', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(page(0, 2))
      .mockRejectedValueOnce(timeout())

    const { result } = await renderHook(() => useServerList<number>({ fetcher, pageSize: 2 }))

    await waitFor(() => expect(result.current.items).toEqual([0, 1]))

    await act(async () => { result.current.loadMore() })

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.items).toEqual([0, 1])
    expect(result.current.hasMore).toBe(false)
  })

  it('resumes from where it stopped, without discarding what loaded', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(page(0, 2))
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(page(1, 2))

    const { result } = await renderHook(() => useServerList<number>({ fetcher, pageSize: 2 }))
    await waitFor(() => expect(result.current.items).toEqual([0, 1]))

    await act(async () => { result.current.loadMore() })
    await waitFor(() => expect(result.current.error).toBeTruthy())

    await act(async () => { result.current.retry() })

    // Appends rather than replaces: retry is a resume, so the two rows already on screen
    // are not thrown away to recover the page that failed.
    await waitFor(() => expect(result.current.items).toEqual([0, 1, 2, 3]))
    expect(result.current.error).toBeNull()
    expect(result.current.hasMore).toBe(true)
  })

  it('clears the error once a page succeeds', async () => {
    const fetcher = jest.fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(page(0, 2))

    const { result } = await renderHook(() => useServerList<number>({ fetcher, pageSize: 2 }))
    await waitFor(() => expect(result.current.error).toBeTruthy())

    // Nothing loaded, so this retries page 0 and replaces rather than appending — the
    // offset is still 0 and appending an empty list to an empty list is the same thing.
    await act(async () => { result.current.retry() })

    await waitFor(() => expect(result.current.items).toEqual([0, 1]))
    expect(result.current.error).toBeNull()
  })

  it('prefers what the server said over the fallback', async () => {
    const err: any = new Error('Request failed with status code 500')
    err.response = { status: 500, data: { error: 'Database is locked' }, statusText: '', headers: {}, config: {} }
    const fetcher = jest.fn().mockRejectedValue(err)

    const { result } = await renderHook(() =>
      useServerList<number>({ fetcher, pageSize: 2, errorFallback: 'Never shown.' }))

    await waitFor(() => expect(result.current.error).toBe('Database is locked'))
  })
})

describe('useServerList — a change of deps', () => {
  it('is not settled on the render that sees the new deps', async () => {
    const fetcher = jest.fn().mockResolvedValue([])
    const seen: boolean[] = []

    const { result, rerender } = await renderHook(
      ({ q }: { q: string }) => {
        const list = useServerList<number>({ fetcher, pageSize: 2, deps: [q] })
        seen.push(list.hasMore)
        return list
      },
      { initialProps: { q: 'zzz' } },
    )

    await waitFor(() => expect(result.current.hasMore).toBe(false))
    seen.length = 0

    await rerender({ q: '' })

    // The first render after the change must already say "not settled"; the reset
    // effect that sets the state itself runs only after it.
    expect(seen[0]).toBe(true)
    await waitFor(() => expect(result.current.hasMore).toBe(false))
  })
})

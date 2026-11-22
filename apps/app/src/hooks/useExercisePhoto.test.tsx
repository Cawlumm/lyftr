import { renderHook, waitFor } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import { client, useAuthStore } from '../lib/lyftr'
import { clearExercisePhotoCache, useExercisePhoto } from './useExercisePhoto'

// React Native's jest FileReader cannot read a Blob built in node; the browser's and the device's can.
class FakeReader {
  result: string | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  error = null
  readAsDataURL() { this.result = 'data:image/jpeg;base64,AAAA'; setTimeout(() => this.onload?.(), 0) }
}
const realReader = global.FileReader
beforeEach(() => { clearExercisePhotoCache(); global.FileReader = FakeReader as never })
afterAll(() => { global.FileReader = realReader })
afterEach(() => jest.restoreAllMocks())

describe('useExercisePhoto', () => {
  it('makes no request without a photo id', async () => {
    const photo = jest.spyOn(client.exerciseAPI, 'photo')
    const { result } = await renderHook(() => useExercisePhoto(3, 'thumb', undefined))
    expect(result.current).toEqual({ failed: false })
    expect(photo).not.toHaveBeenCalled()
  })

  it('loads once per id, size and photo id, as a data URI', async () => {
    const photo = jest.spyOn(client.exerciseAPI, 'photo').mockResolvedValue(new Blob(['abc'], { type: 'image/jpeg' }))
    const first = await renderHook(() => useExercisePhoto(3, 'thumb', 'p1'))
    await waitFor(() => expect(first.result.current.uri).toMatch(/^data:/))
    const second = await renderHook(() => useExercisePhoto(3, 'thumb', 'p1'))
    expect(second.result.current.uri).toMatch(/^data:/)
    expect(photo).toHaveBeenCalledTimes(1)
    expect(photo).toHaveBeenCalledWith(3, 'thumb', 'p1')
  })

  it('refetches when the photo id changes', async () => {
    const photo = jest.spyOn(client.exerciseAPI, 'photo').mockResolvedValue(new Blob(['abc']))
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useExercisePhoto(3, 'full', id), { initialProps: { id: 'a' } })
    await waitFor(() => expect(result.current.uri).toBeTruthy())
    await rerender({ id: 'b' })
    await waitFor(() => expect(photo).toHaveBeenCalledWith(3, 'full', 'b'))
  })

  it('reports failure and keeps no uri', async () => {
    jest.spyOn(client.exerciseAPI, 'photo').mockRejectedValue(new Error('404'))
    const { result } = await renderHook(() => useExercisePhoto(3, 'thumb', 'p1'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.uri).toBeUndefined()
  })

  it('forgets every photo on sign-out', async () => {
    const photo = jest.spyOn(client.exerciseAPI, 'photo').mockResolvedValue(new Blob(['abc'], { type: 'image/jpeg' }))
    useAuthStore.setState({ isAuthenticated: true })
    const first = await renderHook(() => useExercisePhoto(3, 'thumb', 'p1'))
    await waitFor(() => expect(first.result.current.uri).toMatch(/^data:/))
    useAuthStore.setState({ isAuthenticated: false })
    const after = await renderHook(() => useExercisePhoto(3, 'thumb', 'p1'))
    await waitFor(() => expect(after.result.current.uri).toMatch(/^data:/))
    expect(photo).toHaveBeenCalledTimes(2)
  })

  it('holds at most 100 photos, dropping the oldest first', async () => {
    const photo = jest.spyOn(client.exerciseAPI, 'photo').mockResolvedValue(new Blob(['abc'], { type: 'image/jpeg' }))
    const ids = Array.from({ length: 101 }, (_, i) => i + 1)
    // One hook per photo in a single render: a fixed count, so the hook order never changes.
    const all = await renderHook(() => ids.map((id) => useExercisePhoto(id, 'thumb', 'p')))
    await waitFor(() => expect(all.result.current.every((r) => r.uri)).toBe(true))
    await all.unmount()
    expect(photo).toHaveBeenCalledTimes(101)
    await renderHook(() => useExercisePhoto(101, 'thumb', 'p'))
    expect(photo).toHaveBeenCalledTimes(101)
    const oldest = await renderHook(() => useExercisePhoto(1, 'thumb', 'p'))
    await waitFor(() => expect(oldest.result.current.uri).toMatch(/^data:/))
    expect(photo).toHaveBeenCalledTimes(102)
  })
})

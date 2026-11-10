import { act, fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { ExerciseImage } from './ExerciseImage'
import { IMAGE_RETRY_DELAY_MS, IMAGE_RETRY_JITTER_MS } from '../../hooks/useImageRetry'
import { useServerStore } from '../../lib/lyftr'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const A = 'https://oedb.example/a.webp'
const B = 'https://oedb.example/b.webp'
const images = () => screen.container.queryAll(n => n.type === 'Image')
const fail = async () => { await fireEvent(images()[0], 'error') }
const wait = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms) }) }
const LONGEST = IMAGE_RETRY_DELAY_MS + IMAGE_RETRY_JITTER_MS

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

describe('ExerciseImage', () => {
  it('shows the glyph after a failure, then tries the same url once more after a delay', async () => {
    await render(<ExerciseImage url={A} />)
    await fail()
    expect(images()).toHaveLength(0)

    await wait(IMAGE_RETRY_DELAY_MS - 1)
    expect(images()).toHaveLength(0)

    await wait(LONGEST)
    expect(images()).toHaveLength(1)
    expect(images()[0].props.source).toEqual({ uri: A })
  })

  it('jitters the retry so a failed list does not come back in one burst', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    await render(<ExerciseImage url={A} />)
    await fail()
    await wait(IMAGE_RETRY_DELAY_MS + IMAGE_RETRY_JITTER_MS / 2 - 1)
    expect(images()).toHaveLength(0)
    await wait(1)
    expect(images()).toHaveLength(1)
  })

  it('retries only once', async () => {
    await render(<ExerciseImage url={A} />)
    await fail()
    await wait(LONGEST)
    await fail()
    await wait(LONGEST * 10)
    expect(images()).toHaveLength(0)
  })

  it('a new url starts over, even after the retry was spent', async () => {
    await render(<ExerciseImage url={A} />)
    await fail()
    await wait(LONGEST)
    await fail()

    await screen.rerender(<ExerciseImage url={B} />)
    expect(images()).toHaveLength(1)
    expect(images()[0].props.source).toEqual({ uri: B })

    // ...and earns its own single retry.
    await fail()
    await wait(LONGEST)
    expect(images()).toHaveLength(1)
  })

  it('drops the pending retry when it unmounts', async () => {
    const set = jest.spyOn(globalThis, 'setTimeout')
    const clear = jest.spyOn(globalThis, 'clearTimeout')
    await render(<ExerciseImage url={A} />)
    await fail()
    const i = set.mock.calls.findIndex(([, ms]) => (ms ?? 0) >= IMAGE_RETRY_DELAY_MS)
    const retry = set.mock.results[i].value
    await screen.unmount()
    expect(clear).toHaveBeenCalledWith(retry)
  })

  describe('oedb images', () => {
    const ID = '48fe6ee6-f6e4-4d8b-9be5-a235eb8ca7e5'
    const OEDB = `https://oedb.example/api/v1/images/${ID}`
    const THUMB = `http://100.106.145.44:3000/api/v1/media/exercise-thumbs/${ID}`
    beforeEach(() => { useServerStore.setState({ serverUrl: 'http://100.106.145.44:3000' }) })
    afterEach(async () => { await act(async () => { useServerStore.setState({ serverUrl: '' }) }) })

    it("loads the server's thumbnail, not the full image", async () => {
      await render(<ExerciseImage url={OEDB} />)
      expect(images()[0].props.source).toEqual({ uri: THUMB })
    })

    it('falls back to the original at once when the thumbnail fails (a server without the route)', async () => {
      await render(<ExerciseImage url={OEDB} />)
      await fail()
      expect(images()).toHaveLength(1)
      expect(images()[0].props.source).toEqual({ uri: OEDB })
    })

    it('gives the original its usual single retry, and never goes back to the thumbnail', async () => {
      await render(<ExerciseImage url={OEDB} />)
      await fail()
      await fail()
      expect(images()).toHaveLength(0)
      await wait(LONGEST)
      expect(images()[0].props.source).toEqual({ uri: OEDB })
    })
  })
})

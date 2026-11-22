import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { EXERCISE_PAGE_SIZE, exerciseFilterGroups, parseFilters } from '@lyftr/shared'
import type { Exercise } from '@lyftr/shared'

const mockPush = jest.fn()
const mockSetParams = jest.fn()
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a), setParams: (...a: unknown[]) => mockSetParams(...a),
    navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true,
  },
  useFocusEffect: () => {},
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: ({ children }: { children: unknown }) => children,
}))

// The badge is another slice's component; the browser only needs to mount it, so a stand-in
// keeps this test about the browser.
jest.mock('./CustomBadge', () => {
  const { Text } = require('react-native')
  return { CustomBadge: () => <Text>Custom</Text> }
}, { virtual: true })
const mockMy = jest.fn()
jest.mock('../../hooks/useMyExercises', () => ({ useMyExercises: (...a: unknown[]) => mockMy(...a) }))

import { client } from '../../lib/lyftr'
import { ExerciseBrowser } from './ExerciseBrowser'

const bench: Exercise = {
  id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: [],
  category: 'strength', equipment: 'barbell', description: '',
}

const renderBrowser = async () => await render(<ExerciseBrowser />)

const noMy = { supported: false, items: [] as Exercise[], failed: false, reload: jest.fn() }
const mineOf = (items: Exercise[]) => ({ supported: true, items, failed: false, reload: jest.fn() })
const custom = (id: number, name: string): Exercise => ({ ...bench, id, name, is_custom: true })

beforeEach(() => { mockMy.mockReturnValue(noMy) })
afterEach(() => { jest.restoreAllMocks(); mockPush.mockReset(); mockSetParams.mockReset() })

describe('ExerciseBrowser (mobile)', () => {
  it('asks for an unfiltered first page and opens a row on the exercise page', async () => {
    const list = jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
    await renderBrowser()

    await fireEvent.press(await screen.findByText('Bench Press'))

    expect(list).toHaveBeenCalledWith({ page: 1 })
    expect(mockPush).toHaveBeenCalledWith('/workouts/exercise/1')
  })

  // The /exercises?q=&muscle=&equipment= redirect seeds the browser; the first request must
  // already carry them, not fire unfiltered and then refetch.
  it('makes its first request with the seeded query and filters, dropping an invalid muscle', async () => {
    const list = jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
    const raw: Record<string, string> = { muscle: 'not-a-muscle', equipment: 'barbell' }
    const initialFilters = parseFilters(exerciseFilterGroups(), (key) => raw[key] ?? null)
    await render(<ExerciseBrowser initialQuery="bench" initialFilters={initialFilters} />)
    await screen.findByText('Bench Press')

    expect(list).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenNthCalledWith(1, expect.objectContaining({ equipment: 'barbell', page: 1 }))
    expect(list.mock.calls[0][0]).not.toHaveProperty('muscle_group')
    expect(JSON.stringify(list.mock.calls[0][0])).toContain('bench')
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove filter: Barbell' })).toBeTruthy()
  })

  const openFilters = async () => await fireEvent.press(screen.getByRole('button', { name: 'Filters' }))

  it('sends the sheet filters to the server and resets them', async () => {
    const list = jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
    await renderBrowser()
    await screen.findByText('Bench Press')
    await openFilters()

    await fireEvent.press(screen.getByRole('button', { name: 'Chest', selected: false }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ muscle_group: 'chest', page: 1 }))

    await fireEvent.press(screen.getByText('Dumbbell'))
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ muscle_group: 'chest', equipment: 'dumbbell', page: 1 }))

    await fireEvent.press(screen.getByText('Reset'))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1 }))
  })

  it('counts the filters on the button and removes one from its chip', async () => {
    const list = jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
    await renderBrowser()
    await screen.findByText('Bench Press')
    await openFilters()
    await fireEvent.press(screen.getByRole('button', { name: 'Chest', selected: false }))
    await fireEvent.press(screen.getByRole('button', { name: 'Barbell', selected: false }))
    await fireEvent.press(screen.getByText('Done'))

    expect(await screen.findByRole('button', { name: 'Filters, 2 active' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Remove filter: Chest' }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ equipment: 'barbell', page: 1 }))
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeTruthy()
  })

  // The URL write is web's: native has no address bar, and setParams there would re-render the
  // route on every keystroke for nothing.
  it('leaves the route params alone on native', async () => {
    jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
    await renderBrowser()
    await screen.findByText('Bench Press')
    await fireEvent.changeText(screen.getByPlaceholderText('Search exercises…'), 'curl')
    await fireEvent.press(screen.getByRole('button', { name: 'Filters' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Chest', selected: false }))
    expect(mockSetParams).not.toHaveBeenCalled()
  })

  // An empty filter result must not read as an empty library: that answer offers "Try again"
  // and says the library is still loading, which is false when the server answered.
  it('says no exercise matches when a filter returns nothing, not that the library is empty', async () => {
    jest.spyOn(client.exerciseAPI, 'list').mockResolvedValueOnce([bench]).mockResolvedValue([])
    await renderBrowser()
    await screen.findByText('Bench Press')
    await openFilters()

    // Muscles is a long section: it shows six and folds the rest behind "Show N more".
    await fireEvent.press(screen.getAllByRole('button', { name: /^Show \d+ more$/ })[0])
    await fireEvent.press(screen.getByText('Calves'))

    expect(await screen.findByText('No exercises match')).toBeTruthy()
    expect(screen.queryByText('The exercise library is still loading')).toBeNull()
  })

  it('shows the empty-library state when an unfiltered list is empty', async () => {
    jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([])
    await renderBrowser()

    expect(await screen.findByText('The exercise library is still loading')).toBeTruthy()
    expect(screen.queryByText('No exercises match')).toBeNull()
  })

  it('says the load failed instead of an empty catalogue', async () => {
    const err: any = new Error('timeout of 20000ms exceeded')
    err.code = 'ECONNABORTED'
    jest.spyOn(client.exerciseAPI, 'list').mockRejectedValue(err)
    await renderBrowser()

    expect(await screen.findByText("Couldn't load exercises")).toBeTruthy()
    expect(screen.queryByText('No exercises found')).toBeNull()
  })

  describe('custom exercises', () => {
    // The "any custom exercise?" probe asks for one row; the group above the list asks for six.
    const mineSplit = (any: Exercise[], group: Exercise[]) =>
      mockMy.mockImplementation((_q: unknown, limit: number) => (limit === 1 ? mineOf(any) : mineOf(group)))
    const openFilters = async () => fireEvent.press(screen.getByRole('button', { name: /^Filters/ }))

    it('hides the + and Custom only on a server without custom exercises', async () => {
      jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
      await renderBrowser()
      await screen.findByText('Bench Press')

      expect(screen.queryByRole('button', { name: 'Create exercise' })).toBeNull()
      await openFilters()
      expect(screen.queryByText('Custom only')).toBeNull()
    })

    it('offers Custom only in the filter sheet only to someone who has a custom exercise', async () => {
      mineSplit([], [])
      jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
      const { unmount } = await renderBrowser()
      await screen.findByText('Bench Press')
      await openFilters()
      expect(screen.queryByText('Custom only')).toBeNull()
      await unmount()

      mineSplit([custom(7, 'Soleus Slouch')], [])
      await renderBrowser()
      await screen.findByText('Bench Press')
      await openFilters()
      expect(screen.getByText('Custom only')).toBeTruthy()
    })

    it('Custom only pages through mine: true and counts as an active filter', async () => {
      mineSplit([custom(7, 'Soleus Slouch')], [])
      const list = jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
      await renderBrowser()
      await screen.findByText('Bench Press')
      await openFilters()
      await fireEvent.press(screen.getByText('Custom only'))
      await fireEvent.press(screen.getByRole('button', { name: 'Done' }))

      await waitFor(() => expect(list).toHaveBeenLastCalledWith({ mine: true, page: 1 }))
      expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeTruthy()
    })

    it('says there are none yet under Custom only when empty, and that none match when searched', async () => {
      mineSplit([], [])
      jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([])
      await render(<ExerciseBrowser initialFilters={{ muscle: null, equipment: null, show: 'mine' }} />)
      expect(await screen.findByText('No custom exercises yet')).toBeTruthy()

      await fireEvent.changeText(screen.getByPlaceholderText('Search exercises…'), 'zzz')
      expect(await screen.findByText('None of your exercises match')).toBeTruthy()
    })

    it('shows the custom group with a badge above the catalog', async () => {
      mockMy.mockReturnValue(mineOf([custom(7, 'Soleus Slouch')]))
      jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
      await renderBrowser()

      expect(await screen.findByText('Soleus Slouch')).toBeTruthy()
      expect(screen.getByText('Custom')).toBeTruthy()
      expect(screen.getByText('Your exercises')).toBeTruthy()
      expect(screen.getByText('From the catalog')).toBeTruthy()
      expect(screen.getByText('Bench Press')).toBeTruthy()
    })

    it('caps the group at five and offers See all, which turns Custom only on', async () => {
      mockMy.mockReturnValue(mineOf(Array.from({ length: 6 }, (_, i) => custom(10 + i, `Mine ${i + 1}`))))
      const list = jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
      await renderBrowser()

      await screen.findByText('Mine 5')
      expect(screen.queryByText('Mine 6')).toBeNull()
      await fireEvent.press(screen.getByRole('button', { name: 'See all of yours' }))
      await waitFor(() => expect(list).toHaveBeenLastCalledWith({ mine: true, page: 1 }))
    })

    it('opens the create page seeded with the search text, from the + button', async () => {
      mockMy.mockReturnValue(mineOf([]))
      jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
      await renderBrowser()
      await screen.findByText('Bench Press')
      await fireEvent.changeText(screen.getByPlaceholderText('Search exercises…'), ' Soleus ')

      await fireEvent.press(screen.getByRole('button', { name: 'Create exercise' }))

      expect(mockPush).toHaveBeenCalledWith({ pathname: '/workouts/exercise/new', params: { name: 'Soleus' } })
    })
  })

  // A report of the library stopping after its second page was the dev stack's 64-row catalogue
  // stub answering short, not this screen. FlatList repeats onEndReached on momentum while a page
  // is in flight; the repeat is dropped, and the next end reached asks for the following page.
  it('asks for the next page each time the end is reached, past the third', async () => {
    const pageOf = (n: number): Exercise[] => Array.from({ length: EXERCISE_PAGE_SIZE },
      (_, i) => ({ ...bench, id: n * 1000 + i, name: `Exercise ${n}-${i}` }))
    const pending: (() => void)[] = []
    const list = jest.spyOn(client.exerciseAPI, 'list').mockImplementation(((params?: { page?: number }) =>
      new Promise((resolve) => pending.push(() => resolve(pageOf(params?.page ?? 1))))) as never)
    await renderBrowser()
    await act(async () => { pending.shift()!() })
    await screen.findByText('Exercise 1-0')

    for (let n = 2; n <= 4; n++) {
      await fireEvent(screen.getByText('Exercise 1-0'), 'endReached')
      await fireEvent(screen.getByText('Exercise 1-0'), 'endReached')
      expect(list).toHaveBeenCalledTimes(n)
      expect(list).toHaveBeenLastCalledWith({ page: n })
      await act(async () => { pending.shift()!() })
    }

    expect(list.mock.calls.map(([params]) => params?.page)).toEqual([1, 2, 3, 4])
  })
})

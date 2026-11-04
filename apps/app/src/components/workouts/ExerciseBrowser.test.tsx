import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { exerciseFilterGroups, parseFilters } from '@lyftr/shared'
import type { Exercise } from '@lyftr/shared'

const mockPush = jest.fn()
const mockSetParams = jest.fn()
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a), setParams: (...a: unknown[]) => mockSetParams(...a),
    navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true,
  },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: ({ children }: { children: unknown }) => children,
}))

import { client } from '../../lib/lyftr'
import { ExerciseBrowser } from './ExerciseBrowser'

const bench: Exercise = {
  id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: [],
  category: 'strength', equipment: 'barbell', description: '',
}

const renderBrowser = async () => await render(<ExerciseBrowser />)

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

    await fireEvent.press(screen.getByRole('button', { name: 'chest', selected: false }))
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
    await fireEvent.press(screen.getByRole('button', { name: 'chest', selected: false }))
    await fireEvent.press(screen.getByRole('button', { name: 'Barbell', selected: false }))
    await fireEvent.press(screen.getByText('Done'))

    expect(await screen.findByRole('button', { name: 'Filters, 2 active' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Remove filter: chest' }))
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
    await fireEvent.press(screen.getByRole('button', { name: 'chest', selected: false }))
    expect(mockSetParams).not.toHaveBeenCalled()
  })

  // An empty filter result must not read as an empty library: that answer offers "Try again"
  // and says the library is still loading, which is false when the server answered.
  it('says no exercise matches when a filter returns nothing, not that the library is empty', async () => {
    jest.spyOn(client.exerciseAPI, 'list').mockResolvedValueOnce([bench]).mockResolvedValue([])
    await renderBrowser()
    await screen.findByText('Bench Press')
    await openFilters()

    await fireEvent.press(screen.getByText('calves'))

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
})

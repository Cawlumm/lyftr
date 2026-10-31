import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Exercise } from '@lyftr/shared'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
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

afterEach(() => { jest.restoreAllMocks(); mockPush.mockReset() })

describe('ExerciseBrowser (mobile)', () => {
  it('asks for an unfiltered first page and opens a row on the exercise page', async () => {
    const list = jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
    await renderBrowser()

    await fireEvent.press(await screen.findByText('Bench Press'))

    expect(list).toHaveBeenCalledWith({ page: 1 })
    expect(mockPush).toHaveBeenCalledWith('/workouts/exercise/1')
  })

  it('sends the chips to the server and clears them again', async () => {
    const list = jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
    await renderBrowser()
    await screen.findByText('Bench Press')

    await fireEvent.press(screen.getByRole('button', { name: 'chest' }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ muscle_group: 'chest', page: 1 }))

    await fireEvent.press(screen.getByText('Dumbbell'))
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ muscle_group: 'chest', equipment: 'dumbbell', page: 1 }))

    await fireEvent.press(screen.getByText('Clear filters'))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1 }))
  })

  // An empty chip result must not read as an empty library: that answer offers "Try again"
  // and says the library is still loading, which is false when the server answered.
  it('says no exercise matches when a filter returns nothing, not that the library is empty', async () => {
    jest.spyOn(client.exerciseAPI, 'list').mockResolvedValueOnce([bench]).mockResolvedValue([])
    await renderBrowser()
    await screen.findByText('Bench Press')

    await fireEvent.press(screen.getByText('calves'))

    expect(await screen.findByText('No exercises match. Try another search or clear the filters.')).toBeTruthy()
    expect(screen.queryByText('The exercise library is still loading')).toBeNull()
  })

  it('shows the empty-library state when an unfiltered list is empty', async () => {
    jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([])
    await renderBrowser()

    expect(await screen.findByText('The exercise library is still loading')).toBeTruthy()
    expect(screen.queryByText('No exercises match. Try another search or clear the filters.')).toBeNull()
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

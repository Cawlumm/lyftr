import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Exercise } from '@lyftr/shared'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
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
import { ExercisePicker } from './ExercisePicker'

const bench: Exercise = {
  id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: [],
  category: 'strength', equipment: 'barbell', description: '',
}

const fullPage = (): Exercise[] =>
  Array.from({ length: 50 }, (_, i) => ({ ...bench, id: i + 1, name: `Exercise ${i + 1}` }))

const renderPicker = async () =>
  await render(<ExercisePicker selectedIds={[]} onSelect={jest.fn()} onClose={jest.fn()} />)

afterEach(() => { jest.restoreAllMocks() })

describe('ExercisePicker (mobile)', () => {
  it('shows the empty-library state with Try again when an unfiltered list is empty', async () => {
    jest.spyOn(client.exerciseAPI, 'list')
      .mockResolvedValueOnce([])
      .mockResolvedValue([bench])
    await renderPicker()

    expect(await screen.findByText('The exercise library is still loading')).toBeTruthy()
    expect(screen.queryByText('No exercises found')).toBeNull()

    await fireEvent.press(screen.getByText('Try again'))

    expect(await screen.findByText('Bench Press')).toBeTruthy()
  })

  it('says the load failed instead of an empty catalogue', async () => {
    const err: any = new Error('timeout of 20000ms exceeded')
    err.code = 'ECONNABORTED'
    jest.spyOn(client.exerciseAPI, 'list').mockRejectedValue(err)
    await renderPicker()

    expect(await screen.findByText("Couldn't load exercises")).toBeTruthy()
    expect(screen.getByText(/didn't respond in time/i)).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()
    expect(screen.queryByText('The exercise library is still loading')).toBeNull()
    expect(screen.queryByText('No exercises found')).toBeNull()
  })

  it('a search with no matches keeps No exercises found', async () => {
    jest.spyOn(client.exerciseAPI, 'list').mockImplementation(((params?: { q?: string }) =>
      Promise.resolve(params?.q ? [] : fullPage())) as never)
    await renderPicker()
    await screen.findByText('Exercise 1')

    await fireEvent.changeText(screen.getByPlaceholderText('Search exercises…'), 'zzz')

    await waitFor(() => expect(screen.getByText('No exercises found')).toBeTruthy(), { timeout: 2000 })
    expect(screen.queryByText('The exercise library is still loading')).toBeNull()
  })
})

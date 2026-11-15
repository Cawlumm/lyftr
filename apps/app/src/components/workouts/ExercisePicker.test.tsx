import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Exercise } from '@lyftr/shared'

const mockPush = jest.fn()
let mockPathname = '/workouts/new'
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), navigate: jest.fn(), replace: jest.fn() },
  usePathname: () => mockPathname,
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
import { useMyExercises } from '../../hooks/useMyExercises'
import { resolveExerciseCreate } from '../../lib/exerciseCreateRequests'
import { ExercisePicker } from './ExercisePicker'

jest.mock('../../hooks/useMyExercises', () => ({
  useMyExercises: jest.fn(() => ({ supported: false, items: [], failed: false, reload: jest.fn() })),
}))
const mockMine = useMyExercises as jest.Mock
const mineState = (items: Exercise[] = [], supported = true) =>
  mockMine.mockReturnValue({ supported, items, failed: false, reload: jest.fn() })

const bench: Exercise = {
  id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: [],
  category: 'strength', equipment: 'barbell', description: '',
}

const fullPage = (): Exercise[] =>
  Array.from({ length: 50 }, (_, i) => ({ ...bench, id: i + 1, name: `Exercise ${i + 1}` }))

const renderPicker = async () =>
  await render(<ExercisePicker selectedIds={[]} onSelect={jest.fn()} onClose={jest.fn()} />)

afterEach(() => {
  jest.restoreAllMocks()
  mockPush.mockClear()
  mockPathname = '/workouts/new'
  mockMine.mockReturnValue({ supported: false, items: [], failed: false, reload: jest.fn() })
})

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

  describe('custom exercises', () => {
    const mine: Exercise = { ...bench, id: 900, name: 'Soleus Slouch', is_custom: true }
    const type = async (text: string) => {
      await fireEvent.changeText(screen.getByPlaceholderText('Search exercises…'), text)
    }
    const catalog = () => jest.spyOn(client.exerciseAPI, 'list').mockImplementation(((p?: { mine?: boolean }) =>
      Promise.resolve(p?.mine ? [] : [bench])) as never)

    it('shows the create row from two characters, not before', async () => {
      mineState()
      catalog()
      await renderPicker()
      await screen.findByText('Bench Press')
      await type('s')
      expect(screen.queryByLabelText(/Create a custom exercise/)).toBeNull()
      await type('so')
      expect(screen.getByLabelText('Create a custom exercise named So')).toBeTruthy()
      await type('  s ')
      expect(screen.queryByLabelText(/Create a custom exercise/)).toBeNull()
    })

    it('offers the search as a title-cased name, keeping words the user capitalised', async () => {
      mineState()
      catalog()
      await renderPicker()
      await screen.findByText('Bench Press')
      await type('single leg RDL')
      expect(screen.getByLabelText('Create a custom exercise named Single Leg RDL')).toBeTruthy()
    })

    it('has no create row when allowCreate is false or the server does not support it', async () => {
      mineState()
      catalog()
      const { unmount } = await render(<ExercisePicker selectedIds={[]} onSelect={jest.fn()} onClose={jest.fn()} allowCreate={false} />)
      await screen.findByText('Bench Press')
      await type('soleus')
      expect(screen.queryByLabelText(/Create a custom exercise/)).toBeNull()
      await unmount()

      mineState([], false)
      await renderPicker()
      await screen.findByText('Bench Press')
      await type('soleus')
      expect(screen.queryByLabelText(/Create a custom exercise/)).toBeNull()
    })

    it('uses a custom title', async () => {
      catalog()
      await render(<ExercisePicker selectedIds={[]} onSelect={jest.fn()} onClose={jest.fn()} title="Merge into" />)
      expect(await screen.findByText('Merge into')).toBeTruthy()
    })

    it('lists the callers own exercises with the badge, headed, above the catalog', async () => {
      mineState([mine])
      catalog()
      await renderPicker()
      expect(await screen.findByText('Your exercises')).toBeTruthy()
      expect(screen.getByText('Soleus Slouch')).toBeTruthy()
      expect(screen.getByLabelText('Custom exercise')).toBeTruthy()
      expect(screen.getByText('From the catalog')).toBeTruthy()
    })

    it('still lists the callers own exercises where Create is not offered (merge target)', async () => {
      mineState([mine])
      catalog()
      await render(<ExercisePicker selectedIds={[]} onSelect={jest.fn()} onClose={jest.fn()} allowCreate={false} />)
      expect(await screen.findByText('Soleus Slouch')).toBeTruthy()
      expect(screen.queryByLabelText(/Create a custom exercise named/)).toBeNull()
    })

    it('says so and offers a retry when the callers own exercises failed to load', async () => {
      const reload = jest.fn()
      mockMine.mockReturnValue({ supported: true, items: [], failed: true, reload })
      catalog()
      await renderPicker()
      expect(await screen.findByText("Couldn't load your exercises.")).toBeTruthy()
      await fireEvent.press(screen.getByRole('button', { name: /Try again/ }))
      expect(reload).toHaveBeenCalled()
    })

    const pressCreate = async (onSelect: jest.Mock, onClose: jest.Mock) => {
      mineState()
      catalog()
      await render(<ExercisePicker selectedIds={[]} onSelect={onSelect} onClose={onClose} />)
      await screen.findByText('Bench Press')
      await type('Soleus Slouch')
      await fireEvent.press(screen.getByLabelText('Create a custom exercise named Soleus Slouch'))
    }

    it('shows no "No exercises found" under the Create row when nothing matched', async () => {
      mineState()
      jest.spyOn(client.exerciseAPI, 'list').mockImplementation(((p?: { q?: string }) => Promise.resolve(p?.q ? [] : [bench])) as never)
      await renderPicker()
      await screen.findByText('Bench Press')
      await type('Soleus Slouch')
      expect(await screen.findByLabelText('Create a custom exercise named Soleus Slouch')).toBeTruthy()
      await waitFor(() => expect(screen.queryByText('Bench Press')).toBeNull(), { timeout: 2000 })
      expect(screen.queryByText('No exercises found')).toBeNull()
    })

    it('Create closes the picker, then opens the create page with the name and a request', async () => {
      const onClose = jest.fn()
      await pressCreate(jest.fn(), onClose)

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledTimes(1)
      const { pathname, params } = mockPush.mock.calls[0][0]
      expect(pathname).toBe('/workouts/exercise/new')
      expect(params).toEqual({ name: 'Soleus Slouch', request: expect.any(String) })
      expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0])
    })

    it('resolving the request hands the created exercise to onSelect, once', async () => {
      const onSelect = jest.fn()
      await pressCreate(onSelect, jest.fn())
      const created: Exercise = { ...bench, id: 901, name: 'Soleus Slouch', muscle_group: 'calves', is_custom: true }
      const { request } = mockPush.mock.calls[0][0].params

      expect(resolveExerciseCreate(request, created)).toBe(true)
      expect(onSelect).toHaveBeenCalledWith(created)
      expect(resolveExerciseCreate(request, created)).toBe(false)
      expect(onSelect).toHaveBeenCalledTimes(1)
    })

    it('opens the create page in the Programs tab when the picker was opened there', async () => {
      mockPathname = '/programs/new'
      await pressCreate(jest.fn(), jest.fn())
      expect(mockPush.mock.calls[0][0].pathname).toBe('/programs/exercise/new')
    })
  })
})

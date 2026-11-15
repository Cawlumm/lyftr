import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Exercise } from '@lyftr/shared'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ exerciseId: '5' }),
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: ({ children }: { children: unknown }) => children,
}))
jest.mock('./CustomBadge', () => {
  const { Text } = require('react-native')
  return { CustomBadge: () => <Text>Custom</Text> }
}, { virtual: true })
jest.mock('./CustomExerciseSheet', () => ({ CustomExerciseSheet: () => null }), { virtual: true })
jest.mock('./MergeExerciseSheet', () => ({ MergeExerciseSheet: () => null }))
jest.mock('./MuscleDiagram', () => ({ MuscleDiagram: () => null }))
let mockSupported = true
jest.mock('@lyftr/shared', () => {
  const actual = jest.requireActual('@lyftr/shared')
  return { ...actual, customExercises: () => mockSupported }
})

import { client } from '../../lib/lyftr'
import { ExerciseDetailScreen } from './ExerciseDetailScreen'

const base: Exercise = {
  id: 5, name: 'Soleus Slouch', muscle_group: 'calves', secondary_muscles: [],
  category: 'strength', equipment: 'body-only', description: '1. not a step\nsecond line',
}
const customRow: Exercise = { ...base, is_custom: true, archived: false, description: '1. keep it slow' }

const load = async (ex: Exercise) => {
  jest.spyOn(client.exerciseAPI, 'get').mockResolvedValue(ex)
  jest.spyOn(client.exerciseAPI, 'getPRs').mockResolvedValue(null as never)
  jest.spyOn(client.exerciseAPI, 'getHistory').mockResolvedValue([])
  await render(<ExerciseDetailScreen backFallback="/workouts" />)
  await screen.findByText(ex.name)
}

beforeEach(() => { mockSupported = true })
afterEach(() => { jest.restoreAllMocks(); mockReplace.mockReset() })

describe('ExerciseDetailScreen custom exercises', () => {
  it('leaves a catalog row exactly as before: no badge, no actions, Instructions', async () => {
    await load({ ...base, description: '1. Stand tall' })
    expect(screen.queryByText('Custom')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Exercise actions' })).toBeNull()
    expect(screen.getByText('Instructions')).toBeTruthy()
  })

  it('shows the badge, the actions button and the description as Notes for a custom row', async () => {
    await load(customRow)
    expect(screen.getByText('Custom')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Exercise actions' })).toBeTruthy()
    expect(screen.getByText('Notes')).toBeTruthy()
    expect(screen.queryByText('Instructions')).toBeNull()
  })

  it('hides the actions on a server without custom exercises', async () => {
    mockSupported = false
    await load(customRow)
    expect(screen.queryByRole('button', { name: 'Exercise actions' })).toBeNull()
  })

  it('archives from the menu and then shows the archived note', async () => {
    const archive = jest.spyOn(client.exerciseAPI, 'archive').mockResolvedValue({ ...customRow, archived: true })
    await load(customRow)
    await fireEvent.press(screen.getByRole('button', { name: 'Exercise actions' }))
    await fireEvent.press(await screen.findByText('Archive'))

    await waitFor(() => expect(archive).toHaveBeenCalledWith(5), { timeout: 2000 })
    expect(await screen.findByText(/Archived\. It's hidden from search/)).toBeTruthy()
  })

  it('links to the exercise it was merged into', async () => {
    await load({ ...customRow, archived: true, merged_into_id: 9 })
    expect(screen.getByText(/Merged\./)).toBeTruthy()
    await fireEvent.press(screen.getByText('View that exercise'))
    expect(mockReplace).toHaveBeenCalledWith('/workouts/exercise/9')
  })
})

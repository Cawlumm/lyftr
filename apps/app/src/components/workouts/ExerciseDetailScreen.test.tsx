import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Exercise } from '@lyftr/shared'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockSetParams = jest.fn()
let mockParams: { exerciseId: string; merged?: string } = { exerciseId: '5' }
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true, setParams: (...a: unknown[]) => mockSetParams(...a) },
  useLocalSearchParams: () => mockParams,
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
jest.mock('./CustomBadge', () => {
  const { Text } = require('react-native')
  return { CustomBadge: () => <Text>Custom</Text> }
}, { virtual: true })
jest.mock('./MergeExerciseSheet', () => ({ MergeExerciseSheet: () => null }))
jest.mock('./MuscleDiagram', () => ({ MuscleDiagram: () => null }))
let mockSupported = true
let mockPhotos = true
jest.mock('@lyftr/shared', () => {
  const actual = jest.requireActual('@lyftr/shared')
  return { ...actual, customExercises: () => mockSupported, customExercisePhotos: () => mockPhotos }
})
const mockPick = jest.fn()
jest.mock('../../lib/exercisePhoto', () => ({
  cameraSupported: true,
  uploadPart: (p: { uri: string }) => ({ uri: p.uri }),
  pickExercisePhoto: (...a: unknown[]) => mockPick(...a),
}))

import { client, useWorkoutSession } from '../../lib/lyftr'
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

beforeEach(() => { mockSupported = true; mockPhotos = true; mockPick.mockReset() })
afterEach(() => { jest.restoreAllMocks(); mockReplace.mockReset() })

describe('ExerciseDetailScreen custom exercises', () => {
  it('leaves a catalog row exactly as before: no badge, no actions, Instructions', async () => {
    await load({ ...base, description: '1. Stand tall' })
    expect(screen.queryByText('Custom')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Exercise actions' })).toBeNull()
    expect(screen.getByText('Instructions')).toBeTruthy()
  })

  it('shows the badge, the actions button and the same Instructions card for a custom row', async () => {
    await load(customRow)
    expect(screen.getByText('Custom')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Exercise actions' })).toBeTruthy()
    expect(screen.getByText('Instructions')).toBeTruthy()
    expect(screen.getByText('1.')).toBeTruthy()
    expect(screen.queryByText('Notes')).toBeNull()
  })

  it('a catalog exercise without instructions says so; no link to add them', async () => {
    await load({ ...base, description: '' })
    expect(screen.getByText('No instructions for this exercise yet.')).toBeTruthy()
    expect(screen.queryByText('Add instructions')).toBeNull()
  })

  it('your own exercise without instructions links to its edit page', async () => {
    await load({ ...customRow, description: '' })
    expect(screen.queryByText('No instructions for this exercise yet.')).toBeNull()
    await fireEvent.press(screen.getByText('Add instructions'))
    expect(mockPush).toHaveBeenCalledWith('/workouts/exercise/5/edit')
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
    expect(await screen.findByText('Exercise archived')).toBeTruthy()
  })

  it('Restore on the archived note unarchives and says so', async () => {
    const unarchive = jest.spyOn(client.exerciseAPI, 'unarchive').mockResolvedValue({ ...customRow, archived: false })
    await load({ ...customRow, archived: true })
    await fireEvent.press(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(unarchive).toHaveBeenCalledWith(5))
    await waitFor(() => expect(screen.queryByText(/Archived\. It's hidden from search/)).toBeNull())
    expect(await screen.findByText('Exercise restored')).toBeTruthy()
  })

  it('has no Restore on a merged exercise note', async () => {
    await load({ ...customRow, archived: true, merged_into_id: 9 })
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
  })

  it('offers no actions at all on a merged exercise: the merge cannot be undone', async () => {
    await load({ ...customRow, archived: true, merged_into_id: 9 })
    expect(screen.queryByRole('button', { name: 'Exercise actions' })).toBeNull()
  })

  it('says the merge worked on arriving at the kept exercise, once', async () => {
    mockParams = { exerciseId: '5', merged: 'Soleus Slouch' }
    try {
      await load(customRow)
      expect(await screen.findByText('Merged “Soleus Slouch” into this exercise')).toBeTruthy()
      expect(mockSetParams).toHaveBeenCalledWith({ merged: undefined })
    } finally {
      mockParams = { exerciseId: '5' }
    }
  })

  it('Undo on the archive toast restores it', async () => {
    jest.spyOn(client.exerciseAPI, 'archive').mockResolvedValue({ ...customRow, archived: true })
    const unarchive = jest.spyOn(client.exerciseAPI, 'unarchive').mockResolvedValue({ ...customRow, archived: false })
    await load(customRow)
    await fireEvent.press(screen.getByRole('button', { name: 'Exercise actions' }))
    await fireEvent.press(await screen.findByText('Archive'))
    await fireEvent.press(await screen.findByRole('button', { name: 'Undo' }, { timeout: 2000 }))
    await waitFor(() => expect(unarchive).toHaveBeenCalledWith(5))
    await waitFor(() => expect(screen.queryByText(/Archived\. It's hidden from search/)).toBeNull())
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('disables the actions while an archive is in flight, so a second tap cannot send it again', async () => {
    let settle: (e: Exercise) => void = () => {}
    const archive = jest.spyOn(client.exerciseAPI, 'archive').mockImplementation(() => new Promise((r) => { settle = r }))
    await load(customRow)
    await fireEvent.press(screen.getByRole('button', { name: 'Exercise actions' }))
    await fireEvent.press(await screen.findByText('Archive'))
    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Exercise actions' })).toBeDisabled()
    await act(async () => { settle({ ...customRow, archived: true }) })
    expect(await screen.findByText(/Archived\. It's hidden from search/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Exercise actions' })).toBeEnabled()
  })

  // The session holds a copy of each exercise from when it was added. A custom one can be
  // renamed or archived from this page mid-workout, so reopening it must not show that copy.
  describe('an exercise in the active session', () => {
    const inSession = (ex: Exercise) => useWorkoutSession.setState({
      session: { name: 'W', started_at: new Date().toISOString(), exercises: [{ exercise_id: ex.id, exercise: ex, notes: '', rest_seconds: 90, sets: [] }] },
    } as never)
    afterEach(() => act(() => { useWorkoutSession.setState({ session: null } as never) }))

    it('reads a custom exercise from the server, not the session copy', async () => {
      inSession({ ...customRow, name: 'Old Name' })
      await load({ ...customRow, name: 'New Name', archived: true })
      expect(screen.queryByText('Old Name')).toBeNull()
      expect(screen.getByText(/Archived\. It's hidden from search/)).toBeTruthy()
    })

    it('falls back to the session copy of a custom exercise when the server cannot be reached', async () => {
      inSession({ ...customRow, name: 'Offline Copy' })
      jest.spyOn(client.exerciseAPI, 'get').mockRejectedValue(new Error('offline'))
      jest.spyOn(client.exerciseAPI, 'getPRs').mockResolvedValue(null as never)
      jest.spyOn(client.exerciseAPI, 'getHistory').mockResolvedValue([])
      await render(<ExerciseDetailScreen backFallback="/workouts" />)
      expect(await screen.findByText('Offline Copy')).toBeTruthy()
    })

    it('keeps using the session copy of a catalog exercise without a fetch', async () => {
      inSession({ ...base, name: 'Catalog Copy' })
      const get = jest.spyOn(client.exerciseAPI, 'get')
      jest.spyOn(client.exerciseAPI, 'getPRs').mockResolvedValue(null as never)
      jest.spyOn(client.exerciseAPI, 'getHistory').mockResolvedValue([])
      await render(<ExerciseDetailScreen backFallback="/workouts" />)
      expect(await screen.findByText('Catalog Copy')).toBeTruthy()
      expect(get).not.toHaveBeenCalled()
    })
  })

  it('links to the exercise it was merged into', async () => {
    await load({ ...customRow, archived: true, merged_into_id: 9 })
    expect(screen.getByText(/Merged\./)).toBeTruthy()
    await fireEvent.press(screen.getByText('View that exercise'))
    expect(mockReplace).toHaveBeenCalledWith('/workouts/exercise/9')
  })
})

describe('ExerciseDetailScreen photo', () => {
  const staged = { uri: 'file:///p.jpg', name: 'photo.jpg', type: 'image/jpeg' as const }
  const openMenu = async () => fireEvent.press(screen.getByRole('button', { name: 'Exercise actions' }))

  it('offers Add photo on a custom exercise without one, and no Remove', async () => {
    await load(customRow)
    await openMenu()
    expect(await screen.findByText('Add photo')).toBeTruthy()
    expect(screen.queryByText('Remove photo')).toBeNull()
  })

  it('opens the edit page from the menu, inside the same tab', async () => {
    await load(customRow)
    await openMenu()
    await fireEvent.press(await screen.findByText('Edit'))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/workouts/exercise/5/edit'), { timeout: 2000 })
  })

  it('offers no photo actions on a server without photos', async () => {
    mockPhotos = false
    await load(customRow)
    await openMenu()
    await screen.findByText('Edit')
    expect(screen.queryByText('Add photo')).toBeNull()
  })

  it('uploads the picked photo and shows the updated exercise', async () => {
    mockPick.mockResolvedValue({ status: 'picked', photo: staged })
    const upload = jest.spyOn(client.exerciseAPI, 'uploadPhoto').mockResolvedValue({ ...customRow, photo_id: 'p1' })
    const photo = jest.spyOn(client.exerciseAPI, 'photo').mockResolvedValue(new Blob(['x']))
    await load(customRow)
    await openMenu()
    await fireEvent.press(await screen.findByText('Add photo'))
    await fireEvent.press(await screen.findByText('Choose photo'))
    await waitFor(() => expect(upload).toHaveBeenCalledWith(5, { uri: 'file:///p.jpg' }), { timeout: 2000 })
    expect(await screen.findByText('Photo updated')).toBeTruthy()
    await waitFor(() => expect(photo).toHaveBeenCalledWith(5, 'full', 'p1'))
  })

  it('says why when the upload fails and keeps the screen', async () => {
    mockPick.mockResolvedValue({ status: 'picked', photo: staged })
    jest.spyOn(client.exerciseAPI, 'uploadPhoto').mockRejectedValue(new Error('boom'))
    await load(customRow)
    await openMenu()
    await fireEvent.press(await screen.findByText('Add photo'))
    await fireEvent.press(await screen.findByText('Choose photo'))
    expect(await screen.findByText("Can't reach the server right now.", undefined, { timeout: 2000 })).toBeTruthy()
    expect(screen.getByText('Soleus Slouch')).toBeTruthy()
  })

  it('removes the photo from the menu', async () => {
    jest.spyOn(client.exerciseAPI, 'photo').mockResolvedValue(new Blob(['x']))
    const del = jest.spyOn(client.exerciseAPI, 'deletePhoto').mockResolvedValue(customRow)
    await load({ ...customRow, photo_id: 'p1' })
    await openMenu()
    await fireEvent.press(await screen.findByText('Remove photo'))
    await waitFor(() => expect(del).toHaveBeenCalledWith(5), { timeout: 2000 })
    expect(await screen.findByText('Photo removed')).toBeTruthy()
  })

  it('never requests a photo for an exercise without photo_id', async () => {
    const photo = jest.spyOn(client.exerciseAPI, 'photo')
    await load(customRow)
    expect(photo).not.toHaveBeenCalled()
  })
})

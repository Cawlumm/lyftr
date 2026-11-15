import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Exercise } from '@lyftr/shared'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() } }))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

let mockPhotos = false
jest.mock('@lyftr/shared', () => {
  const actual = jest.requireActual('@lyftr/shared')
  return { ...actual, customExercisePhotos: () => mockPhotos }
})
const mockPick = jest.fn()
jest.mock('../../lib/exercisePhoto', () => ({
  cameraSupported: true,
  uploadPart: (p: { uri: string }) => ({ uri: p.uri }),
  pickExercisePhoto: (...a: unknown[]) => mockPick(...a),
}))

import { client } from '../../lib/lyftr'
import { CustomExerciseSheet } from './CustomExerciseSheet'

const saved: Exercise = {
  id: 7, name: 'Soleus Slouch', muscle_group: 'calves', secondary_muscles: [], category: 'strength',
  equipment: 'body-only', description: '', is_custom: true,
}

beforeEach(() => { mockPhotos = false; mockPick.mockReset() })
afterEach(() => { jest.restoreAllMocks() })

const renderCreate = async (extra: Partial<Parameters<typeof CustomExerciseSheet>[0]> = {}) => {
  const onSaved = jest.fn()
  await render(<CustomExerciseSheet open mode="create" initialName="  Soleus Slouch " onSaved={onSaved} onClose={jest.fn()} {...extra} />)
  return onSaved
}

describe('CustomExerciseSheet', () => {
  it('pre-fills the trimmed name', async () => {
    await renderCreate()
    expect(screen.getByDisplayValue('Soleus Slouch')).toBeTruthy()
  })

  it('without a muscle shows the inline error and does not call the API', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText('Pick the main muscle.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('without a name shows the inline error', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate({ initialName: '   ' })
    await fireEvent.press(screen.getByRole('radio', { name: /^calves$/i }))
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText('Give the exercise a name.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('creates with body-only equipment by default and reports the saved exercise', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    const onSaved = await renderCreate()
    await fireEvent.press(screen.getByRole('radio', { name: /^calves$/i }))
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Soleus Slouch', muscle_group: 'calves', equipment: 'body-only', category: 'strength',
    }))
  })

  it('submits from the keyboard return key in the name field', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    const onSaved = await renderCreate()
    await fireEvent(screen.getByDisplayValue('Soleus Slouch'), 'submitEditing')
    expect(screen.getByText('Pick the main muscle.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByRole('radio', { name: /^calves$/i }))
    await fireEvent(screen.getByDisplayValue('Soleus Slouch'), 'submitEditing')
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
  })

  it('keeps a server error inside the open sheet', async () => {
    jest.spyOn(client.exerciseAPI, 'create').mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: 'taken', code: 'EXERCISE_NAME_TAKEN' } },
    })
    const onSaved = await renderCreate()
    await fireEvent.press(screen.getByRole('radio', { name: /^calves$/i }))
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy())
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByText('New exercise')).toBeTruthy()
    expect(await screen.findByText(/already|taken|Couldn't save/i)).toBeTruthy()
  })

  it('edit mode prefills and sends the full body to update', async () => {
    const update = jest.spyOn(client.exerciseAPI, 'update').mockResolvedValue(saved)
    const existing: Exercise = { ...saved, equipment: 'dumbbell', category: 'stretching', secondary_muscles: ['hamstrings'], description: 'Slow' }
    const onSaved = jest.fn()
    await render(<CustomExerciseSheet open mode="edit" exercise={existing} onSaved={onSaved} onClose={jest.fn()} />)
    expect(screen.getByText('Edit exercise')).toBeTruthy()
    expect(screen.getByDisplayValue('Slow')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(update).toHaveBeenCalledWith(7, {
      name: 'Soleus Slouch', muscle_group: 'calves', equipment: 'dumbbell', category: 'stretching',
      secondary_muscles: ['hamstrings'], description: 'Slow',
    })
  })

  it('offers catalog near matches and hands the tapped one to onUseExisting', async () => {
    const bench: Exercise = { ...saved, id: 1, name: 'Soleus Raise', is_custom: false }
    jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([bench])
    const onUseExisting = jest.fn()
    await renderCreate({ onUseExisting })
    await fireEvent.press(await screen.findByRole('button', { name: 'Use Soleus Raise' }, { timeout: 2000 }))
    expect(screen.getByText('Already in the catalog')).toBeTruthy()
    expect(onUseExisting).toHaveBeenCalledWith(bench)
  })
})

describe('CustomExerciseSheet photo', () => {
  const staged = { uri: 'file:///p.jpg', name: 'photo.jpg', type: 'image/jpeg' as const }
  const withPhoto: Exercise = { ...saved, photo_id: 'abc' }

  const fill = async () => {
    await fireEvent.press(screen.getByRole('radio', { name: /^calves$/i }))
    await fireEvent.press(screen.getByRole('button', { name: 'Choose photo' }))
    await screen.findByText('Photo ready. It uploads when you save.')
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }))
  }

  it('has no Photo field on a server without photos', async () => {
    await renderCreate()
    expect(screen.queryByText('Photo')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Choose photo' })).toBeNull()
  })

  it('uploads the chosen photo after create and reports the final exercise', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'picked', photo: staged })
    jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    const upload = jest.spyOn(client.exerciseAPI, 'uploadPhoto').mockResolvedValue(withPhoto)
    const onSaved = await renderCreate()
    await fill()
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(withPhoto))
    expect(upload).toHaveBeenCalledWith(7, { uri: 'file:///p.jpg' })
  })

  it('keeps the exercise when the upload fails: error in the sheet, retry works', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'picked', photo: staged })
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    const upload = jest.spyOn(client.exerciseAPI, 'uploadPhoto')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(withPhoto)
    const onSaved = await renderCreate()
    await fill()
    expect(await screen.findByText(/The exercise was saved, but its photo didn't upload\./)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(withPhoto))
    expect(create).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledTimes(2)
  })

  it('Skip hands back the saved exercise without a photo', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'picked', photo: staged })
    jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    jest.spyOn(client.exerciseAPI, 'uploadPhoto').mockRejectedValue(new Error('boom'))
    const onSaved = await renderCreate()
    await fill()
    await fireEvent.press(await screen.findByRole('button', { name: 'Skip for now' }))
    expect(onSaved).toHaveBeenCalledWith(saved)
  })

  it('explains a refused permission and stages nothing', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'denied', source: 'camera' })
    await renderCreate()
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }))
    expect(await screen.findByText(/can't use the camera/)).toBeTruthy()
    expect(screen.queryByText('Photo ready. It uploads when you save.')).toBeNull()
  })

  it('removes an existing photo on save in edit mode', async () => {
    mockPhotos = true
    jest.spyOn(client.exerciseAPI, 'photo').mockResolvedValue(new Blob(['x']))
    const update = jest.spyOn(client.exerciseAPI, 'update').mockResolvedValue(withPhoto)
    const del = jest.spyOn(client.exerciseAPI, 'deletePhoto').mockResolvedValue(saved)
    const onSaved = jest.fn()
    await render(<CustomExerciseSheet open mode="edit" exercise={withPhoto} onSaved={onSaved} onClose={jest.fn()} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(update).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(7)
  })
})

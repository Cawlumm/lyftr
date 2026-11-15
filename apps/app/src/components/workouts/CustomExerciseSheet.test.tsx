import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Exercise } from '@lyftr/shared'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() } }))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import { client } from '../../lib/lyftr'
import { CustomExerciseSheet } from './CustomExerciseSheet'

const saved: Exercise = {
  id: 7, name: 'Soleus Slouch', muscle_group: 'calves', secondary_muscles: [], category: 'strength',
  equipment: 'body-only', description: '', is_custom: true,
}

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

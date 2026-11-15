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
const mockPickerProps = jest.fn()
jest.mock('./ExercisePicker', () => {
  const { Pressable, Text } = require('react-native')
  return {
    ExercisePicker: (props: { onSelect: (e: unknown) => void }) => {
      mockPickerProps(props)
      return (
        <Pressable accessibilityRole="button" onPress={() => props.onSelect({ id: 9, name: 'Bench Press' })}>
          <Text>pick bench</Text>
        </Pressable>
      )
    },
  }
})

import { client } from '../../lib/lyftr'
import { MergeExerciseSheet } from './MergeExerciseSheet'

const source: Exercise = {
  id: 5, name: 'My Press', muscle_group: 'chest', secondary_muscles: [],
  category: 'strength', equipment: 'barbell', description: '', is_custom: true,
}
const into: Exercise = { ...source, id: 9, name: 'Bench Press', is_custom: false }

const setup = async (onMerged = jest.fn()) => {
  await render(<MergeExerciseSheet source={source} open onClose={jest.fn()} onMerged={onMerged} />)
  await fireEvent.press(screen.getByText('pick bench'))
  return onMerged
}

afterEach(() => { jest.restoreAllMocks(); mockPickerProps.mockClear() })

describe('MergeExerciseSheet', () => {
  it('opens the picker without a create row and excluding the source', async () => {
    await render(<MergeExerciseSheet source={source} open onClose={jest.fn()} onMerged={jest.fn()} />)
    expect(mockPickerProps).toHaveBeenCalledWith(expect.objectContaining({
      allowCreate: false, selectedIds: [5], title: 'Merge “My Press” into',
    }))
  })

  it('states what will move, from the server counts', async () => {
    jest.spyOn(client.exerciseAPI, 'usage').mockResolvedValue({ workouts: 3, program_days: 1 })
    await setup()

    expect(await screen.findByText(/3 workouts and 1 program day/)).toBeTruthy()
    expect(screen.getByText('Merge into “Bench Press”?')).toBeTruthy()
    expect(screen.getByText(/This can't be undone/)).toBeTruthy()
  })

  it('keeps the sheet open with the error when the merge fails', async () => {
    jest.spyOn(client.exerciseAPI, 'usage').mockResolvedValue({ workouts: 1, program_days: 0 })
    jest.spyOn(client.exerciseAPI, 'merge').mockRejectedValue(new Error('boom'))
    const onMerged = await setup()
    await screen.findByText(/1 workout/)

    await fireEvent.press(screen.getByRole('button', { name: 'Merge' }))

    await waitFor(() => expect(client.exerciseAPI.merge).toHaveBeenCalled())
    expect(await screen.findByText("Can't reach the server right now.")).toBeTruthy()
    expect(onMerged).not.toHaveBeenCalled()
    expect(screen.getByText('Merge into “Bench Press”?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Merge' })).toBeTruthy()
  })

  it('merges the source into the picked exercise and reports the result', async () => {
    jest.spyOn(client.exerciseAPI, 'usage').mockResolvedValue({ workouts: 2, program_days: 0 })
    const merge = jest.spyOn(client.exerciseAPI, 'merge')
      .mockResolvedValue({ moved_workouts: 2, moved_program_days: 0, into })
    const onMerged = await setup()
    await screen.findByText(/2 workouts/)

    await fireEvent.press(screen.getByRole('button', { name: 'Merge' }))

    await waitFor(() => expect(onMerged).toHaveBeenCalledTimes(1))
    expect(merge).toHaveBeenCalledWith(5, 9)
  })

  it('cannot confirm when the counts failed to load, and the button retries them', async () => {
    // A server answer with no wording of its own falls back to the sheet's sentence.
    const usage = jest.spyOn(client.exerciseAPI, 'usage')
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 418, data: {} } })
      .mockResolvedValueOnce({ workouts: 2, program_days: 1 })
    const merge = jest.spyOn(client.exerciseAPI, 'merge')
    await setup()

    expect(await screen.findByText("Couldn't count what would move")).toBeTruthy()
    expect(screen.queryByText('Counting what will move…')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(/2 workouts and 1 program day/)).toBeTruthy()
    expect(usage).toHaveBeenCalledTimes(2)
    expect(merge).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Merge' })).toBeTruthy()
  })
})

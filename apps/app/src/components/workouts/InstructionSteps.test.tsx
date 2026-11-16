import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

import { InstructionSteps, instructionSteps } from './InstructionSteps'

describe('instructionSteps', () => {
  it('one step per non-empty line, trimmed, blank lines dropped', () => {
    expect(instructionSteps('  Stand tall \n\n   \nPress up\n')).toEqual(['Stand tall', 'Press up'])
  })

  it('drops a leading "N." or "N)" so numbering is uniform, and only there', () => {
    expect(instructionSteps('1. Stand tall\n2) Press up\n10.   Lower\nDo 3. reps')).toEqual(['Stand tall', 'Press up', 'Lower', 'Do 3. reps'])
  })

  it('nothing for empty or missing text', () => {
    expect(instructionSteps('')).toEqual([])
    expect(instructionSteps(undefined)).toEqual([])
    expect(instructionSteps(' \n ')).toEqual([])
  })
})

describe('InstructionSteps', () => {
  it('numbers catalog text and the owner\'s own text the same way', async () => {
    await render(<InstructionSteps text={'1. Stand tall\n2. Press up'} />)
    expect(screen.getByText('Instructions')).toBeTruthy()
    expect(screen.getByText('1.')).toBeTruthy()
    expect(screen.getByText('2.')).toBeTruthy()
    expect(screen.queryByText('3.')).toBeNull()
  })

  it('a catalog exercise without any says so, in muted text', async () => {
    await render(<InstructionSteps text="" />)
    expect(screen.getByText('No instructions for this exercise yet.')).toBeTruthy()
    expect(screen.queryByText('Add instructions')).toBeNull()
  })

  it('the owner of a custom exercise without any gets a link to add them', async () => {
    const onAdd = jest.fn()
    await render(<InstructionSteps text="  " addHref="/workouts/exercise/5/edit" onAdd={onAdd} />)
    expect(screen.queryByText('No instructions for this exercise yet.')).toBeNull()
    await fireEvent.press(screen.getByText('Add instructions'))
    expect(onAdd).toHaveBeenCalled()
  })
})

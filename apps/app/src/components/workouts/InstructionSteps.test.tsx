import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

import { InstructionSteps } from './InstructionSteps'

describe('InstructionSteps', () => {
  it('numbers catalog text and the owner\'s own text the same way', async () => {
    await render(<InstructionSteps steps={['Stand tall', 'Press up']} />)
    expect(screen.getByText('Instructions')).toBeTruthy()
    expect(screen.getByText('1.')).toBeTruthy()
    expect(screen.getByText('2.')).toBeTruthy()
    expect(screen.queryByText('3.')).toBeNull()
  })

  it('a catalog exercise without any says so, in muted text', async () => {
    await render(<InstructionSteps steps={[]} />)
    expect(screen.getByText('No instructions for this exercise yet.')).toBeTruthy()
    expect(screen.queryByText('Add instructions')).toBeNull()
  })

  it('the owner of a custom exercise without any gets a link to add them', async () => {
    const onAdd = jest.fn()
    await render(<InstructionSteps steps={[]} addHref="/workouts/exercise/5/edit" onAdd={onAdd} />)
    expect(screen.queryByText('No instructions for this exercise yet.')).toBeNull()
    await fireEvent.press(screen.getByText('Add instructions'))
    expect(onAdd).toHaveBeenCalled()
  })
})

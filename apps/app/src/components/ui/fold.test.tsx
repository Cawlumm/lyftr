import { fireEvent, render, screen } from '@testing-library/react-native'
import { IconTileGroup } from './IconTileGroup'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const options = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `o${i + 1}`, label: `Option ${i + 1}` }))

describe('option lists fold by OPTION_FOLD', () => {
  it('a list of more than 8 shows 6 and "Show N more", and keeps a chosen option past the cut in view', async () => {
    await render(<IconTileGroup label="Pick" options={options(12)} value="o10" onChange={jest.fn()} />)
    expect(screen.getByRole('radio', { name: 'Option 6' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Option 7' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Option 10' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Show 5 more' }))
    expect(screen.getByRole('radio', { name: 'Option 12' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.queryByRole('radio', { name: 'Option 7' })).toBeNull()
  })

  it('a list of 8 or fewer never folds', async () => {
    await render(<IconTileGroup label="Pick" layout="tile" options={options(8)} value={null} onChange={jest.fn()} />)
    expect(screen.getByRole('radio', { name: 'Option 8' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

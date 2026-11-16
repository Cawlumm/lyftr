import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { CollapsibleChips } from './CollapsibleChips'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const chips = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`)
const renderRow = (items: string[]) =>
  render(<CollapsibleChips items={items} renderChip={(m) => <Text key={m}>{m}</Text>} />)

describe('CollapsibleChips', () => {
  it('shows the first three and "+N more", which unfolds and folds again', async () => {
    await renderRow(chips(9))
    expect(screen.getByText('m3')).toBeTruthy()
    expect(screen.queryByText('m4')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Show 6 more' }))
    expect(screen.getByText('m9')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.queryByText('m4')).toBeNull()
  })

  it('never folds away a single chip', async () => {
    await renderRow(chips(4))
    expect(screen.getByText('m4')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

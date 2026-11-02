import { fireEvent, render, screen } from '@testing-library/react-native'
import type { FilterGroup } from '@lyftr/shared'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}))

import { ActiveFilters } from './ActiveFilters'
import { FilterButton } from './FilterButton'
import { FilterSheet } from './FilterSheet'

// Deliberately not the exercise filters: the sheet is generic over whatever groups a screen
// declares, and a test that only used muscles would not notice if it quietly were not.
const groups: FilterGroup[] = [
  { key: 'meal', label: 'Meal', options: [{ value: 'lunch', label: 'Lunch' }, { value: 'dinner', label: 'Dinner' }] },
  { key: 'source', label: 'Source', options: [{ value: 'saved', label: 'Saved' }] },
]

const none = { meal: null, source: null } as Record<string, string | null>

describe('FilterSheet (mobile)', () => {
  it('renders every option of every group', async () => {
    await render(<FilterSheet open groups={groups} values={none} onChange={jest.fn()} onReset={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByText('Meal')).toBeTruthy()
    expect(screen.getByText('Source')).toBeTruthy()
    expect(screen.getByText('Dinner')).toBeTruthy()
    expect(screen.getByText('Saved')).toBeTruthy()
  })

  it('renders nothing when closed', async () => {
    await render(<FilterSheet open={false} groups={groups} values={none} onChange={jest.fn()} onReset={jest.fn()} onClose={jest.fn()} />)
    expect(screen.queryByText('Meal')).toBeNull()
  })

  it('reports the option picked, and null when the one that is on is picked again', async () => {
    const onChange = jest.fn()
    await render(
      <FilterSheet open groups={groups} values={{ meal: 'lunch', source: null }} onChange={onChange} onReset={jest.fn()} onClose={jest.fn()} />
    )
    await fireEvent.press(screen.getByText('Dinner'))
    expect(onChange).toHaveBeenLastCalledWith('meal', 'dinner')
    await fireEvent.press(screen.getByRole('button', { name: 'Lunch' }))
    expect(onChange).toHaveBeenLastCalledWith('meal', null)
  })

  it('does not reset when nothing is on, and resets and closes when something is', async () => {
    const onReset = jest.fn()
    const onClose = jest.fn()
    const { rerender } = await render(
      <FilterSheet open groups={groups} values={none} onChange={jest.fn()} onReset={onReset} onClose={onClose} />
    )
    await fireEvent.press(screen.getByText('Reset'))
    expect(onReset).not.toHaveBeenCalled()

    await rerender(
      <FilterSheet open groups={groups} values={{ meal: 'lunch', source: null }} onChange={jest.fn()} onReset={onReset} onClose={onClose} />
    )
    await fireEvent.press(screen.getByText('Reset'))
    expect(onReset).toHaveBeenCalled()
    await fireEvent.press(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('FilterButton (mobile)', () => {
  it('is plain at zero and carries the count above it', async () => {
    const { rerender } = await render(<FilterButton active={0} onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
    await rerender(<FilterButton active={2} onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })
})

describe('ActiveFilters (mobile)', () => {
  it('lists what is on and removes by key', async () => {
    const onRemove = jest.fn()
    await render(<ActiveFilters groups={groups} values={{ source: 'saved', meal: 'dinner' }} onRemove={onRemove} />)
    expect(screen.getByText('Dinner')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Remove filter: Saved' }))
    expect(onRemove).toHaveBeenCalledWith('source')
  })

  it('renders nothing when nothing is on', async () => {
    await render(<ActiveFilters groups={groups} values={none} onRemove={jest.fn()} />)
    expect(screen.queryByText('Dinner')).toBeNull()
  })
})

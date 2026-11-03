import { act, fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { Menu } from './Menu'
import { SHEET_ANIM_MS } from './Sheet'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Native: the menu is the ActionSheet phones already had; the dropdown is web-only.
describe('Menu (native)', () => {
  it('opens an action sheet of its items and runs the one picked after the sheet closes', async () => {
    jest.useFakeTimers()
    const edit = jest.fn()
    await render(<Menu label="Workout options" title="Workout" items={[{ label: 'Edit', onSelect: edit }, { label: 'Delete', destructive: true, onSelect: jest.fn() }]} />)
    expect(screen.queryByText('Edit')).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: 'Workout options' }))
    expect(screen.getByText('Workout')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()

    await fireEvent.press(screen.getByText('Edit'))
    expect(edit).not.toHaveBeenCalled()
    await act(() => { jest.advanceTimersByTime(SHEET_ANIM_MS) })
    expect(edit).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })
})

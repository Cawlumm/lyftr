import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { FoodSearchResult } from '@lyftr/shared'

// Same preamble as the programs component tests: expo-router can't load under bare jest,
// and the ui barrel reaches it via useTheme → lib/lyftr.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

import { FoodResultRow } from './FoodResultRow'
import { client } from '../../lib/lyftr'

const item = (overrides: Partial<FoodSearchResult> = {}): FoodSearchResult => ({
  name: 'Chicken Breast',
  calories: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
  fiber: 0,
  serving_size: '100g',
  source: 'off',
  ...overrides,
})

const OPTIONS_LABEL = 'Chicken Breast options'

afterEach(() => {
  jest.restoreAllMocks()
})

describe('FoodResultRow', () => {
  // The Recent and search tabs render this same row and must not gain a delete control —
  // they show foods the user does not own. This is the regression guard for #115's
  // restructure of a component shared by all three tabs.
  it('renders no options menu when it is not a saved food', () => {
    render(<FoodResultRow item={item()} onPress={() => {}} />)
    expect(screen.queryByLabelText(OPTIONS_LABEL)).toBeNull()
  })

  it('renders no options menu when savedFoodId is given without onDeleted', () => {
    render(<FoodResultRow item={item()} onPress={() => {}} savedFoodId={7} />)
    expect(screen.queryByLabelText(OPTIONS_LABEL)).toBeNull()
  })

  it('renders the options menu for a saved food', () => {
    render(<FoodResultRow item={item()} onPress={() => {}} savedFoodId={7} onDeleted={() => {}} />)
    expect(screen.getByLabelText(OPTIONS_LABEL)).toBeTruthy()
  })

  it('tapping the row still selects the food rather than opening the menu', () => {
    const onPress = jest.fn()
    render(<FoodResultRow item={item()} onPress={onPress} savedFoodId={7} onDeleted={() => {}} />)
    fireEvent.press(screen.getByText('Chicken Breast'))
    expect(onPress).toHaveBeenCalled()
  })

  it('deletes through the API and reports the id back after confirming', async () => {
    jest.useFakeTimers()
    const del = jest.spyOn(client.savedFoodsAPI, 'delete').mockResolvedValue(undefined as never)
    const onDeleted = jest.fn()
    const onDeleteFailed = jest.fn()

    render(
      <FoodResultRow
        item={item()}
        onPress={() => {}}
        savedFoodId={7}
        onDeleted={onDeleted}
        onDeleteFailed={onDeleteFailed}
      />,
    )

    fireEvent.press(screen.getByLabelText(OPTIONS_LABEL))
    fireEvent.press(screen.getByText('Remove from Favorites'))
    // ActionSheet defers the action until after its dismiss animation so the confirm
    // sheet isn't presented mid-close.
    act(() => { jest.runOnlyPendingTimers() })

    fireEvent.press(screen.getByText('Remove'))

    await waitFor(() => expect(del).toHaveBeenCalledWith(7))
    expect(onDeleted).toHaveBeenCalledWith(7)
    expect(onDeleteFailed).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  // A swallowed failure leaves the row on screen with no explanation, which reads as a
  // dead button — the exact shape of the complaint in #115.
  it('reports a failed delete instead of dropping the row', async () => {
    jest.useFakeTimers()
    jest.spyOn(client.savedFoodsAPI, 'delete').mockRejectedValue(new Error('boom'))
    const onDeleted = jest.fn()
    const onDeleteFailed = jest.fn()

    render(
      <FoodResultRow
        item={item()}
        onPress={() => {}}
        savedFoodId={7}
        onDeleted={onDeleted}
        onDeleteFailed={onDeleteFailed}
      />,
    )

    fireEvent.press(screen.getByLabelText(OPTIONS_LABEL))
    fireEvent.press(screen.getByText('Remove from Favorites'))
    act(() => { jest.runOnlyPendingTimers() })
    fireEvent.press(screen.getByText('Remove'))

    await waitFor(() => expect(onDeleteFailed).toHaveBeenCalled())
    expect(onDeleted).not.toHaveBeenCalled()
    jest.useRealTimers()
  })
})

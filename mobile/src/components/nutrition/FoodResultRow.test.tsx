import { fireEvent, render, screen } from '@testing-library/react-native'
import type { FoodSearchResult } from '@lyftr/shared'
// The `mock` prefix is what lets a jest.mock factory close over an import — the rule is
// jest's, and it means the async-storage mock needs no require() inside the factory.
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { FoodResultRow } from './FoodResultRow'

// Same preamble as the programs component tests: expo-router can't load under bare jest,
// and the ui barrel reaches it via useTheme → lib/lyftr. These sit below the imports
// because babel-jest hoists jest.mock above them anyway — writing them first was a
// convention, not a requirement, and it cost an import/first warning per file.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

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

const ADD = 'Add Chicken Breast to Favorites'
const REMOVE = 'Remove Chicken Breast from Favorites'

describe('FoodResultRow', () => {
  // The label carries the toggle state, because the fill that conveys it visually is
  // invisible to a screen reader.
  it('offers to add when the food is not favourited', () => {
    render(<FoodResultRow item={item()} onPress={() => {}} favorited={false} onToggleFavorite={() => {}} />)
    expect(screen.getByLabelText(ADD)).toBeTruthy()
    expect(screen.queryByLabelText(REMOVE)).toBeNull()
  })

  it('offers to remove when the food is favourited', () => {
    render(<FoodResultRow item={item()} onPress={() => {}} favorited onToggleFavorite={() => {}} />)
    expect(screen.getByLabelText(REMOVE)).toBeTruthy()
    expect(screen.queryByLabelText(ADD)).toBeNull()
  })

  // One tap, no confirmation sheet in between — that is the whole point of the change.
  it('toggles on a single tap', () => {
    const onToggleFavorite = jest.fn()
    render(<FoodResultRow item={item()} onPress={() => {}} favorited onToggleFavorite={onToggleFavorite} />)
    fireEvent.press(screen.getByLabelText(REMOVE))
    expect(onToggleFavorite).toHaveBeenCalledTimes(1)
  })

  // Tapping the star must not also select the food; the row press and the star press are
  // separate targets even though the star sits inside the row's Pressable.
  it('does not select the food when the star is tapped', () => {
    const onPress = jest.fn()
    render(<FoodResultRow item={item()} onPress={onPress} favorited={false} onToggleFavorite={() => {}} />)
    fireEvent.press(screen.getByLabelText(ADD))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('still selects the food when the row body is tapped', () => {
    const onPress = jest.fn()
    render(<FoodResultRow item={item()} onPress={onPress} favorited={false} onToggleFavorite={() => {}} />)
    fireEvent.press(screen.getByText('Chicken Breast'))
    expect(onPress).toHaveBeenCalled()
  })

  // Mid-request the star is inert, so a double tap can't fire a create and a delete for
  // the same food and leave the list disagreeing with the server.
  it('ignores taps while the toggle is in flight', () => {
    const onToggleFavorite = jest.fn()
    render(
      <FoodResultRow
        item={item()}
        onPress={() => {}}
        favorited
        onToggleFavorite={onToggleFavorite}
        togglingFavorite
      />,
    )
    fireEvent.press(screen.getByLabelText(REMOVE))
    expect(onToggleFavorite).not.toHaveBeenCalled()
  })
})

import { render, screen } from '@testing-library/react-native'
import type { FoodLog } from '@lyftr/shared'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { FoodEntryRow } from './FoodEntryRow'

// Same preamble as FoodResultRow's test: expo-router can't load under bare jest, and the
// ui barrel reaches it via useTheme → lib/lyftr.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const entry = (overrides: Partial<FoodLog> = {}): FoodLog => ({
  id: 1,
  name: 'Extra Virgin Olive Oil',
  meal: 'breakfast',
  calories: 40,
  protein: 0,
  carbs: 0,
  fat: 4.7,
  fiber: 0,
  servings: 1,
  serving_size: '15mL',
  logged_at: '2026-09-21T08:00:00Z',
  logged_on: '2026-09-21',
  ...overrides,
}) as FoodLog

const row = (e: FoodLog) =>
  render(<FoodEntryRow entry={e} first onPress={() => {}} onEdit={() => {}} onDeleted={() => {}} />)

describe('FoodEntryRow amount', () => {
  // The bug this pins: the row rendered `entry.servings` raw, so a third of a 15 ml
  // serving read "× 0.3333333333333333" here while the entry's own screen — which goes
  // through formatLoggedAmount — read "5 ml" (#171).
  it('reads in the unit the food was logged in', () => {
    row(entry({ servings: 1 / 3, serving_quantity: 15, serving_unit: 'ml' }))
    expect(screen.getByText('5 ml')).toBeTruthy()
  })

  it('falls back to servings when nothing knows what one measures', () => {
    row(entry({ servings: 1 / 3, serving_quantity: 0, serving_unit: '' }))
    expect(screen.getByText('0.33 servings')).toBeTruthy()
  })

  // One serving is the default and says nothing, so the row stays quiet.
  it('says nothing for a single serving', () => {
    row(entry({ servings: 1, serving_quantity: 15, serving_unit: 'ml' }))
    expect(screen.queryByText('15 ml')).toBeNull()
  })
})

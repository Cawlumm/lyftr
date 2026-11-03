import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: View,
  }
})

import { i18n } from '@lyftr/shared'
import { useLanguageStore, useSettingsStore } from '../../lib/lyftr'
import SettingsScreen from '../../../app/(tabs)/settings/index'

// Renders the real Settings screen, so it fails if the screen stops rendering <LanguageSheet>
// (the sheet's own test cannot catch that: it renders the sheet directly).
describe('Settings screen Language row', () => {
  beforeEach(() => {
    useSettingsStore.setState({ loaded: true, loadFailed: false, fetch: jest.fn().mockResolvedValue(undefined) })
  })

  it('opens the language sheet and switches language', async () => {
    await render(<SettingsScreen />)

    expect(screen.getByText('Language')).toBeTruthy()
    expect(screen.queryByText('Español')).toBeNull()

    await fireEvent.press(screen.getByText('Language'))

    expect(screen.getByText('Español')).toBeTruthy()
    // The row's own value reads "System (English)" too, so the sheet's option makes two.
    expect(screen.getAllByText('System (English)')).toHaveLength(2)
    expect(screen.getByText('English')).toBeTruthy()

    await act(async () => {
      await fireEvent.press(screen.getByText('Español'))
    })

    expect(useLanguageStore.getState().preference).toBe('es')
    expect(i18n.language).toBe('es')
  })
})

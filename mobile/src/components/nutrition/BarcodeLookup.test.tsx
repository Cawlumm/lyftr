import { act, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { i18n } from '@lyftr/shared'
import { BarcodeLookup } from './BarcodeLookup'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

afterEach(async () => {
  jest.useRealTimers()
  await i18n.changeLanguage('en')
})

describe('BarcodeLookup', () => {
  // The silence past a few seconds is what made people rescan (#164), so a slow lookup
  // says it is still going rather than sitting on the first line indefinitely.
  it('says it is still looking once the lookup runs long', async () => {
    jest.useFakeTimers()
    await render(<BarcodeLookup code="3017620422003" />)

    expect(screen.getByText('Looking up this product…')).toBeTruthy()
    await act(async () => { jest.advanceTimersByTime(4000) })
    expect(screen.getByText('Still looking. This can take a few seconds.')).toBeTruthy()
  })

  it('reads its copy from the catalog in Spanish', async () => {
    await i18n.changeLanguage('es')
    jest.useFakeTimers()
    await render(<BarcodeLookup code="3017620422003" />)

    expect(screen.getByText('Buscando este producto…')).toBeTruthy()
    await act(async () => { jest.advanceTimersByTime(4000) })
    expect(screen.getByText('Seguimos buscando. Esto puede tardar unos segundos.')).toBeTruthy()
  })
})

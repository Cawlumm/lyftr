import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import { LANGUAGE_ORDER, LANGUAGE_NAMES } from '@lyftr/shared'
import { LanguageSheet, filterLanguages } from './LanguageSheet'

const setup = (value: 'system' | 'en' | 'es' = 'system') => {
  const onSelect = jest.fn()
  const onClose = jest.fn()
  render(<LanguageSheet open value={value} onSelect={onSelect} onClose={onClose} />)
  return { onSelect, onClose }
}

describe('LanguageSheet', () => {
  it('lists System first, then names in registry order', () => {
    setup()
    const buttons = screen.getAllByRole('button')
    const labels = ['System (English)', ...LANGUAGE_ORDER.map((c) => LANGUAGE_NAMES[c])]
    expect(buttons).toHaveLength(labels.length)
    labels.forEach((l) => expect(screen.getByText(l)).toBeTruthy())
    expect(buttons[0]).toHaveTextContent('System (English)')
    LANGUAGE_ORDER.forEach((c, i) => expect(buttons[i + 1]).toHaveTextContent(new RegExp('^' + LANGUAGE_NAMES[c])))
  })

  it('marks only the current value as selected', () => {
    setup('es')
    const buttons = screen.getAllByRole('button')
    const selected = buttons.filter((b) => b.props.accessibilityState?.selected === true)
    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveTextContent(/^Español/)
  })

  it('shows the machine-translated note under Español only', () => {
    setup()
    expect(screen.getAllByText('Traducción automática')).toHaveLength(1)
    expect(screen.queryByText('Machine-translated')).toBeNull()
  })

  it('pressing a different language closes and selects', () => {
    const { onSelect, onClose } = setup('system')
    fireEvent.press(screen.getByText('English'))
    expect(onClose).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith('en')
  })

  it('pressing the current language closes without selecting', () => {
    const { onSelect, onClose } = setup('en')
    fireEvent.press(screen.getByText('English'))
    expect(onClose).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('has no search field at the current language count', () => {
    setup()
    expect(screen.queryByPlaceholderText('Search languages')).toBeNull()
  })
})

describe('filterLanguages', () => {
  it.each([
    ['', ['en', 'es']],
    ['   ', ['en', 'es']],
    ['espanol', ['es']],
    ['ESP', ['es']],
    ['es', ['es']],
    ['zz', []],
  ])('%j -> %j', (q, want) => {
    expect(filterLanguages(LANGUAGE_ORDER, q)).toEqual(want)
  })
})

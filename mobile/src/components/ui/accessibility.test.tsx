import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen } from '@testing-library/react-native'
import { ArrowLeft } from './icons'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}))

import { Button, Field, IconButton, PasswordField } from '.'
import { GradientButton, IconInput } from '../authui'

// The screen-reader names and roles C11/C12 introduced. Pinned explicitly (not a snapshot) so
// dropping one fails with the name of the thing that went missing. The language is en
// (the test default), so these are the English strings.
describe('accessibility labels and roles (en)', () => {
  it('IconButton is a button named by its label', async () => {
    await render(<IconButton icon={ArrowLeft} label="Go back" onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
    expect(screen.getByLabelText('Go back')).toBeTruthy()
  })

  it('every back button on the five screens is labelled with common.goBack', () => {
    const files = [
      'app/(tabs)/workouts/new.tsx',
      'app/(tabs)/workouts/start.tsx',
      'app/(tabs)/programs/new.tsx',
      'app/(tabs)/programs/[id]/edit.tsx',
      'app/(tabs)/nutrition/log.tsx',
    ]
    for (const f of files) {
      expect(readFileSync(join(__dirname, '../../..', f), 'utf8')).toMatch(/(accessibilityLabel|label)=\{t\('common\.goBack'\)\}/)
    }
  })

  it('Field names its TextInput from the visible label', async () => {
    await render(<Field label="Email" value="" onChangeText={jest.fn()} />)
    expect(screen.getByLabelText('Email').props.accessibilityLabel).toBe('Email')
  })

  it('Field without a label does not invent one', async () => {
    await render(<Field placeholder="Search" value="" onChangeText={jest.fn()} />)
    expect(screen.getByPlaceholderText('Search').props.accessibilityLabel).toBeUndefined()
  })

  it('IconInput names its TextInput from the label, not the upper-cased copy', async () => {
    await render(<IconInput label="Email" icon="mail" value="" onChangeText={jest.fn()} />)
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('PasswordField labels the input and a show/hide toggle button', async () => {
    await render(<PasswordField label="Password" textContentType="password" value="" onChangeText={jest.fn()} />)
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: /show password/i })).toBeTruthy()
  })

  it('Button and GradientButton are role=button', async () => {
    await render(
      <>
        <Button title="Save" onPress={jest.fn()} />
        <GradientButton title="Sign in" onPress={jest.fn()} />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })
})

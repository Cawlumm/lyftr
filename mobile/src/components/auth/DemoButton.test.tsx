import { Linking, Platform } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { DemoButton, DEMO_EMAIL, DEMO_PASSWORD, DEMO_URL } from './DemoButton'

jest.mock('@lyftr/shared', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
jest.mock('../authui', () => {
  const { Pressable, Text } = require('react-native')
  return {
    SecondaryButton: ({ title, onPress }: any) => (
      <Pressable accessibilityRole="button" onPress={onPress}><Text>{title}</Text></Pressable>
    ),
  }
})

const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os })
const realOS = Platform.OS
afterEach(() => { setOS(realOS); jest.restoreAllMocks() })

describe('DemoButton', () => {
  it('signs in to the current server on web', async () => {
    setOS('web')
    const open = jest.spyOn(Linking, 'openURL')
    const signIn = jest.fn().mockResolvedValue(undefined)
    await render(<DemoButton demoEnabled signIn={signIn} onFailed={jest.fn()} />)
    await fireEvent.press(screen.getByRole('button', { name: /auth\.login\.demo/ }))
    expect(signIn).toHaveBeenCalledWith(DEMO_EMAIL, DEMO_PASSWORD)
    expect(open).not.toHaveBeenCalled()
  })

  it('ignores a second press while the first sign-in is pending', async () => {
    setOS('web')
    let finish!: () => void
    const signIn = jest.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    await render(<DemoButton demoEnabled signIn={signIn} onFailed={jest.fn()} />)
    await fireEvent.press(screen.getByRole('button'))
    await fireEvent.press(screen.getByRole('button'))
    expect(signIn).toHaveBeenCalledTimes(1)
    await act(async () => { finish() })
    await fireEvent.press(screen.getByRole('button'))
    expect(signIn).toHaveBeenCalledTimes(2)
  })

  it('reports a failed sign-in on web', async () => {
    setOS('web')
    const err = new Error('401')
    const onFailed = jest.fn()
    await render(<DemoButton demoEnabled signIn={jest.fn().mockRejectedValue(err)} onFailed={onFailed} />)
    await fireEvent.press(screen.getByRole('button'))
    expect(onFailed).toHaveBeenCalledWith(err)
  })

  it('is absent on web when the server has no demo account', async () => {
    setOS('web')
    await render(<DemoButton demoEnabled={false} signIn={jest.fn()} onFailed={jest.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each(['android', 'ios'])('opens the hosted demo on %s', async (os) => {
    setOS(os)
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never)
    const signIn = jest.fn()
    await render(<DemoButton demoEnabled={false} signIn={signIn} onFailed={jest.fn()} />)
    await fireEvent.press(screen.getByRole('button'))
    expect(open).toHaveBeenCalledWith(DEMO_URL)
    expect(signIn).not.toHaveBeenCalled()
  })
})

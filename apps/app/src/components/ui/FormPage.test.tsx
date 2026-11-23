import { Text } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }
let mockPrevent: { on: boolean; cb?: (o: { repeat: () => void }) => void } = { on: false }
const mockDisable = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: () => mockRouter.back(), replace: (...a: unknown[]) => mockRouter.replace(...a), canGoBack: () => mockRouter.canGoBack() },
  usePreventRemove: (on: boolean, cb: (o: { repeat: () => void }) => void) => { mockPrevent = { on, cb }; return mockDisable },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: ({ children }: { children: unknown }) => children,
}))

import { FormField, FormPage, useDiscardGuard } from './FormPage'

function Page(props: { secondary?: { label: string; onPress: () => void }; dirty?: boolean; error?: string | null; onRetry?: () => void; onPress?: () => void; destructive?: object }) {
  const guard = useDiscardGuard(!!props.dirty)
  return (
    <FormPage
      title="Edit thing" subtitle={<Text>Sub</Text>} guard={guard} secondary={props.secondary} error={props.error} onRetry={props.onRetry}
      primary={{ label: 'Save', onPress: props.onPress ?? jest.fn() }}
      destructive={props.destructive as never}
    >
      <Text>body</Text>
      <FormField accessibilityLabel="Thing" />
    </FormPage>
  )
}

beforeEach(() => { Object.values(mockRouter).forEach((f) => f.mockClear()); mockDisable.mockClear(); mockRouter.canGoBack.mockReturnValue(true) })

describe('FormPage', () => {
  it('shows the title, subtitle and body, and presses the primary action', async () => {
    const onPress = jest.fn()
    await render(<Page onPress={onPress} />)
    expect(screen.getByText('Edit thing')).toBeTruthy()
    expect(screen.getByText('Sub')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    expect(onPress).toHaveBeenCalled()
  })

  it('does not wrap the content in a pressable or accessible element', async () => {
    await render(<Page />)
    let node = screen.getByText('body').parent
    while (node && node.type !== 'RCTScrollView' && String(node.type) !== 'ScrollView') {
      expect(node.props.onPress).toBeUndefined()
      expect(node.props.onClick).toBeUndefined()
      expect(node.props.accessible).not.toBe(true)
      node = node.parent
    }
  })

  it('says what went wrong next to the action', async () => {
    await render(<Page error="Couldn't save" />)
    expect(screen.getByText("Couldn't save")).toBeTruthy()
  })

  it('offers Try again beside the action when there is an error and a retry', async () => {
    const onRetry = jest.fn()
    await render(<Page error="Couldn't save" onRetry={onRetry} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('has no Try again without an error', async () => {
    await render(<Page onRetry={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('gives its fields a Done bar id of its own, not the shared default', async () => {
    await render(<Page />)
    const id = screen.getByLabelText('Thing').props.inputAccessoryViewID
    expect(id).toMatch(/^form-done-/)
    expect(id).not.toBe('lyftr-keyboard-done')
  })

  it('shows a secondary action beside the primary', async () => {
    const onPress = jest.fn()
    await render(<Page secondary={{ label: 'Cancel', onPress }} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(onPress).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('Back goes back', async () => {
    await render(<Page />)
    await fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
    expect(mockRouter.back).toHaveBeenCalled()
  })

  it('guards leaving only while dirty, behind a Discard changes sheet that Keep editing closes', async () => {
    await render(<Page dirty />)
    expect(mockPrevent.on).toBe(true)
    const repeat = jest.fn()
    await waitFor(() => mockPrevent.cb?.({ repeat }))
    expect(await screen.findByText('Discard changes?')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }))
    expect(repeat).not.toHaveBeenCalled()
  })

  it('Discard lets the blocked navigation through', async () => {
    await render(<Page dirty />)
    const repeat = jest.fn()
    await waitFor(() => mockPrevent.cb?.({ repeat }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Discard' }))
    expect(mockDisable).toHaveBeenCalled()
    expect(repeat).toHaveBeenCalled()
  })

  it('does not guard a clean page', async () => {
    await render(<Page />)
    expect(mockPrevent.on).toBe(false)
  })

  it('a destructive action confirms first, then runs', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined)
    await render(<Page destructive={{ label: 'Delete', confirmTitle: 'Delete it?', confirmMessage: 'Gone.', confirmLabel: 'Yes, delete', onConfirm, failedMessage: 'Failed' }} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).not.toHaveBeenCalled()
    await fireEvent.press(await screen.findByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
  })

  it('a destructive action that fails says so in the sheet and stays open', async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error('boom'))
    await render(<Page destructive={{ label: 'Delete', confirmTitle: 'Delete it?', confirmMessage: 'Gone.', confirmLabel: 'Yes, delete', onConfirm, failedMessage: 'Could not delete' }} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByText(/Could not delete|reach the server/)).toBeTruthy()
    expect(screen.getByText('Delete it?')).toBeTruthy()
  })
})

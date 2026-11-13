import { Text } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { ConfirmSheet } from './ConfirmSheet'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const props = {
  open: true,
  title: 'Delete Program?',
  message: '"PPL" will be permanently deleted.',
  confirmLabel: 'Delete',
  destructive: true,
}

// The sheet is the only place a failed confirmation has to report itself: the row it came
// from is still on screen unchanged, so a sheet that dismisses on failure says nothing at
// all. Mirrors web's ConfirmSheet.test.tsx; Escape has no native twin (Sheet routes the
// Android back button through the same onClose, which the busy guard covers).
describe('ConfirmSheet', () => {
  it('says what is about to happen and offers both ways out', async () => {
    await render(<ConfirmSheet {...props} onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByText('"PPL" will be permanently deleted.')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('renders extra input between the message and the buttons, and holds confirm until it is filled', async () => {
    const onConfirm = jest.fn()
    const { rerender } = await render(
      <ConfirmSheet {...props} confirmDisabled onConfirm={onConfirm} onCancel={jest.fn()}>
        <Text>password field</Text>
      </ConfirmSheet>,
    )
    expect(screen.getByText('password field')).toBeTruthy()
    await fireEvent.press(screen.getByText('Delete'))
    expect(onConfirm).not.toHaveBeenCalled()

    await rerender(
      <ConfirmSheet {...props} onConfirm={onConfirm} onCancel={jest.fn()}>
        <Text>password field</Text>
      </ConfirmSheet>,
    )
    await fireEvent.press(screen.getByText('Delete'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows why the last confirm failed, without dismissing', async () => {
    await render(
      <ConfirmSheet {...props} error="The server is restarting or unreachable." onConfirm={jest.fn()} onCancel={jest.fn()} />,
    )
    expect(screen.getByText('The server is restarting or unreachable.')).toBeTruthy()
    expect(screen.getByText('Delete Program?')).toBeTruthy()
  })

  // Cancel was live while `busy`: the sheet closed, the request carried on, and the 502
  // landed with nowhere to be shown.
  it('refuses Cancel while the confirmed action is in flight', async () => {
    const onCancel = jest.fn()
    await render(<ConfirmSheet {...props} busy onConfirm={jest.fn()} onCancel={onCancel} />)
    await fireEvent.press(screen.getByText('Cancel'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('refuses a second confirm while the first is in flight', async () => {
    const onConfirm = jest.fn()
    await render(<ConfirmSheet {...props} busy busyLabel="Deleting…" onConfirm={onConfirm} onCancel={jest.fn()} />)
    await fireEvent.press(screen.getByText('Deleting…'))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // The counterweight: refusing dismissal only while in flight, never after.
  it('lets go again once the action has settled', async () => {
    const onCancel = jest.fn()
    const onConfirm = jest.fn()
    await render(
      <ConfirmSheet {...props} error="The server is restarting or unreachable." onConfirm={onConfirm} onCancel={onCancel} />,
    )
    await fireEvent.press(screen.getByText('Cancel'))
    await fireEvent.press(screen.getByText('Delete'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when closed', async () => {
    await render(<ConfirmSheet {...props} open={false} onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.queryByText('Delete Program?')).toBeNull()
  })
})

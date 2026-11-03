import { Text } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { SheetBackdrop } from './SheetFrame.web'

// Imported by path: jest-expo's default (native) project resolves SheetFrame.tsx for the bare
// name. The handlers compare DOM targets, so the events carry the node they hit.
describe('SheetFrame.web backdrop', () => {
  const press = async (down: unknown, up: unknown) => {
    const backdrop = screen.getByTestId('sheet-backdrop')
    await fireEvent(backdrop, 'pointerDown', { target: down, currentTarget: backdrop })
    await fireEvent(backdrop, 'click', { target: up, currentTarget: backdrop })
  }

  it('closes on a press that starts and ends on the scrim', async () => {
    const onClose = jest.fn()
    await render(<SheetBackdrop onClose={onClose} dialog><Text>body</Text></SheetBackdrop>)
    const backdrop = screen.getByTestId('sheet-backdrop')
    await press(backdrop, backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when the press started inside the dialog', async () => {
    const onClose = jest.fn()
    await render(<SheetBackdrop onClose={onClose} dialog><Text>body</Text></SheetBackdrop>)
    const backdrop = screen.getByTestId('sheet-backdrop')
    await press(screen.getByText('body'), backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open when the press ends inside the dialog', async () => {
    const onClose = jest.fn()
    await render(<SheetBackdrop onClose={onClose} dialog><Text>body</Text></SheetBackdrop>)
    const backdrop = screen.getByTestId('sheet-backdrop')
    await press(backdrop, screen.getByText('body'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

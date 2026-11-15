import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { PhotoSlot, type PhotoSlotLabels } from './PhotoSlot'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../lib/exercisePhoto', () => ({ cameraSupported: true }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

const labels: PhotoSlotLabels = {
  add: 'Add photo', addHint: 'Optional', replace: 'Replace', remove: 'Remove', choose: 'Choose photo',
  take: 'Take photo', sourceTitle: 'Add a photo', preview: 'Preview', pending: 'Ready',
}

describe('PhotoSlot', () => {
  it('empty: Add opens the source choice, and a source is reported', async () => {
    const onPick = jest.fn()
    await render(<PhotoSlot filled={false} labels={labels} onPick={onPick} onRemove={jest.fn()} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }))
    await fireEvent.press(await screen.findByText('Take photo'))
    await waitFor(() => expect(onPick).toHaveBeenCalledWith('camera'), { timeout: 2000 })
  })

  it('filled: shows the picture with Replace and Remove, and the pending note', async () => {
    const onRemove = jest.fn()
    await render(<PhotoSlot filled pending uri="file:///p.jpg" labels={labels} onPick={jest.fn()} onRemove={onRemove} />)
    expect(screen.getByLabelText('Preview')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy()
  })

  it('says why a pick failed', async () => {
    await render(<PhotoSlot filled={false} error="Nope" labels={labels} onPick={jest.fn()} onRemove={jest.fn()} />)
    expect(screen.getByText('Nope')).toBeTruthy()
  })
})

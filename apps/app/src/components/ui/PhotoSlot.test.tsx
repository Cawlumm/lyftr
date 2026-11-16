import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { PhotoSlot, type PhotoSlotLabels } from './PhotoSlot'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../lib/exercisePhoto', () => ({ cameraSupported: true }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

const labels: PhotoSlotLabels = {
  add: 'Add photo', addHint: 'Optional', replace: 'Change photo', remove: 'Remove', choose: 'Choose photo',
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

  it('filled: nothing on the picture; one Change control opens choose, take and remove', async () => {
    const onRemove = jest.fn()
    const onPick = jest.fn()
    await render(<PhotoSlot filled pending uri="file:///p.jpg" labels={labels} onPick={onPick} onRemove={onRemove} />)
    expect(screen.getByLabelText('Preview')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Change photo' })).toHaveLength(1)
    expect(screen.queryByText('Remove')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }))
    expect(await screen.findByText('Choose photo')).toBeTruthy()
    expect(screen.getByText('Take photo')).toBeTruthy()
    await fireEvent.press(screen.getByText('Remove'))
    await waitFor(() => expect(onRemove).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('says why a pick failed', async () => {
    await render(<PhotoSlot filled={false} error="Nope" labels={labels} onPick={jest.fn()} onRemove={jest.fn()} />)
    expect(screen.getByText('Nope')).toBeTruthy()
  })
})

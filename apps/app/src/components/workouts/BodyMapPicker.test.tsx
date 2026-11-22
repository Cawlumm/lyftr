import { fireEvent, render, screen } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'

jest.mock('react-native-body-highlighter', () => {
  const { Pressable, View } = require('react-native')
  return {
    __esModule: true,
    default: ({ side, data, onBodyPartPress }: { side: string; data: { slug: string; intensity: number }[]; onBodyPartPress: (p: { slug: string }) => void }) => (
      <View testID={`figure-${side}`} accessibilityHint={JSON.stringify(data)}>
        {['chest', 'upper-back', 'head'].map((slug) => (
          <Pressable key={slug} accessibilityLabel={`${side}-${slug}`} onPress={() => onBodyPartPress({ slug })} />
        ))}
      </View>
    ),
  }
})
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
import { BodyMapPicker } from './BodyMapPicker'

const groups = [
  { key: 'upper', label: 'Upper body', muscles: [{ value: 'chest', label: 'Chest' }, { value: 'lats', label: 'Lats' }] },
  { key: 'legs', label: 'Legs', muscles: [{ value: 'calves', label: 'Calves' }] },
]
const hidden = { hidden: true }

describe('BodyMapPicker', () => {
  it('a tap on a region picks the muscle it stands for; the most specific one where it stands for several', async () => {
    const onChange = jest.fn()
    await render(<BodyMapPicker value={null} onChange={onChange} groups={groups} />)
    await fireEvent.press(screen.getByLabelText('front-chest', hidden))
    expect(onChange).toHaveBeenLastCalledWith('chest')
    await fireEvent.press(screen.getByLabelText('back-upper-back', hidden))
    expect(onChange).toHaveBeenLastCalledWith('lats')
  })

  it('a region that is not a muscle picks nothing', async () => {
    const onChange = jest.fn()
    await render(<BodyMapPicker value={null} onChange={onChange} groups={groups} />)
    await fireEvent.press(screen.getByLabelText('front-head', hidden))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('draws the main muscle brighter than the others', async () => {
    await render(<BodyMapPicker value="chest" secondary={['calves']} onChange={jest.fn()} groups={groups} />)
    const data = JSON.parse(screen.getByTestId('figure-front', hidden).props.accessibilityHint)
    expect(data).toEqual(expect.arrayContaining([{ slug: 'chest', intensity: 2 }, { slug: 'calves', intensity: 1 }]))
    expect(screen.getByText('Chest')).toBeTruthy()
  })

  it('while a muscle is required and none is picked, the nothing-picked line gives way', async () => {
    await render(<BodyMapPicker value={null} invalid onChange={jest.fn()} groups={groups} />)
    expect(screen.queryByText('Nothing picked yet')).toBeNull()
  })

  it('the figures are hidden from a screen reader, and the List holds every muscle by region', async () => {
    const onChange = jest.fn()
    await render(<BodyMapPicker value={null} onChange={onChange} groups={groups} />)
    expect(screen.getByTestId('figure-front', hidden).parent?.parent?.props.importantForAccessibility ?? 'no-hide-descendants').toBe('no-hide-descendants')
    await fireEvent.press(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByText('Upper body')).toBeTruthy()
    await fireEvent.press(screen.getByRole('radio', { name: 'Calves' }))
    expect(onChange).toHaveBeenCalledWith('calves')
  })

  describe('multi (other muscles)', () => {
    it('stays dimmed and offers nothing to pick until there is a main muscle', async () => {
      await render(<BodyMapPicker mode="multi" value={[]} main={null} onChange={jest.fn()} groups={groups} />)
      expect(screen.queryByRole('checkbox')).toBeNull()
      // The toggle stays, disabled, so the card does not change height when it unlocks.
      expect(screen.getByText('List')).toBeTruthy()
      expect(screen.getByText('Front', hidden)).toBeTruthy()
      await fireEvent.press(screen.getByLabelText('front-chest', hidden))
      expect(screen.queryByText('Chest')).toBeNull()
    })

    it('a tap toggles a muscle in and out of the others', async () => {
      const onChange = jest.fn()
      const { rerender } = await render(<BodyMapPicker mode="multi" value={[]} main="calves" onChange={onChange} groups={groups} />)
      await fireEvent.press(screen.getByLabelText('front-chest', hidden))
      expect(onChange).toHaveBeenLastCalledWith(['chest'])
      await rerender(<BodyMapPicker mode="multi" value={['chest']} main="calves" onChange={onChange} groups={groups} />)
      await fireEvent.press(screen.getByLabelText('back-upper-back', hidden))
      expect(onChange).toHaveBeenLastCalledWith(['chest', 'lats'])
      await fireEvent.press(screen.getByLabelText('front-chest', hidden))
      expect(onChange).toHaveBeenLastCalledWith([])
    })

    it('draws the main muscle brighter, names it, and a tap on it says why nothing changed', async () => {
      const onChange = jest.fn()
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
      await render(<BodyMapPicker mode="multi" value={['lats']} main="chest" onChange={onChange} groups={groups} />)
      const data = JSON.parse(screen.getByTestId('figure-front', hidden).props.accessibilityHint)
      expect(data).toEqual(expect.arrayContaining([{ slug: 'chest', intensity: 2 }, { slug: 'upper-back', intensity: 1 }]))
      expect(screen.getByText('Main muscle: Chest')).toBeTruthy()
      await fireEvent.press(screen.getByLabelText('front-chest', hidden))
      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByText('Chest is already the main muscle.')).toBeTruthy()
      expect(announce).toHaveBeenCalledWith('Chest is already the main muscle.')
      announce.mockRestore()
    })

    it('each picked muscle is a chip that removes it', async () => {
      const onChange = jest.fn()
      await render(<BodyMapPicker mode="multi" value={['lats', 'calves']} main={null} onChange={onChange} groups={groups} />)
      await fireEvent.press(screen.getByRole('button', { name: 'Remove Lats' }))
      expect(onChange).toHaveBeenLastCalledWith(['calves'])
    })

    it('at the cap a tap adds nothing and says so; removing still works', async () => {
      const onChange = jest.fn()
      await render(<BodyMapPicker mode="multi" value={['lats']} max={1} onChange={onChange} groups={groups} />)
      expect(screen.getByText('1 picked, the most there can be. Remove one to add another.')).toBeTruthy()
      await fireEvent.press(screen.getByLabelText('front-chest', hidden))
      expect(onChange).not.toHaveBeenCalled()
      await fireEvent.press(screen.getByLabelText('back-upper-back', hidden))
      expect(onChange).toHaveBeenLastCalledWith([])
    })

    it('the List is checkboxes, with the main muscle shown but not choosable', async () => {
      const onChange = jest.fn()
      await render(<BodyMapPicker mode="multi" value={['calves']} main="chest" onChange={onChange} groups={groups} />)
      await fireEvent.press(screen.getByRole('button', { name: 'List' }))
      expect(screen.getByRole('checkbox', { name: 'Chest (main muscle)', disabled: true })).toBeTruthy()
      expect(screen.getByRole('checkbox', { name: 'Calves', checked: true })).toBeTruthy()
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Lats' }))
      expect(onChange).toHaveBeenLastCalledWith(['calves', 'lats'])
    })
  })
})

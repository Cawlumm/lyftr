import { fireEvent, render, screen } from '@testing-library/react-native'

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
})

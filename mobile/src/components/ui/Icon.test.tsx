import { render, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { Icon } from './Icon'
import { Scale } from './icons'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

function rootProps() {
  const tree = screen.toJSON()
  if (!tree || Array.isArray(tree)) throw new Error('expected one root')
  return tree
}

// Decorative is the default: an icon beside a label, or inside a named button, must not be
// announced a second time.
describe('Icon', () => {
  it('hides an unlabelled icon from assistive tech', async () => {
    await render(<Icon icon={Scale} />)
    const svg = rootProps()
    if (Platform.OS === 'web') {
      expect(svg.props['aria-hidden']).toBe(true)
    } else {
      expect(svg.props.accessibilityElementsHidden).toBe(true)
      expect(svg.props.importantForAccessibility).toBe('no-hide-descendants')
    }
  })

  it('names a labelled icon as an image', async () => {
    await render(<Icon icon={Scale} label="Bodyweight" />)
    expect(screen.getByRole('image', { name: 'Bodyweight' })).toBeTruthy()
  })

  it('maps the size scale and keeps one stroke', async () => {
    await render(<Icon icon={Scale} size="lg" />)
    const svg = rootProps()
    expect(svg.props.width).toBe(20)
    expect(svg.props.strokeWidth).toBe(2.2)
  })
})

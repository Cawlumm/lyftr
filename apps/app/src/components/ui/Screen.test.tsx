import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import type { ReactTestRendererJSON } from 'react-test-renderer'

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View }
})

import { Screen } from './Screen'

// At phone widths Screen must render exactly what it did before ContentColumn existed: the
// width/centring classes are added only when Platform.OS is web, so native carries none of them.
describe('Screen', () => {
  it('renders the same tree as before ContentColumn on native', async () => {
    const tree = await render(<Screen className="gap-3"><Text>hello</Text></Screen>)
    const root = tree.toJSON() as ReactTestRendererJSON
    const column = root.children?.[0] as ReactTestRendererJSON
    // The exact strings, so this does not lean on a snapshot that was created from the new code.
    expect(root.props.className).toBe('flex-1 bg-surface-base')
    expect(column.props.className).toBe('flex-1 px-5 gap-3')
    expect(tree.toJSON()).toMatchSnapshot()
  })
})

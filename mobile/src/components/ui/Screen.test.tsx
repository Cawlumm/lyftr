import { render } from '@testing-library/react-native'
import { Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View }
})

import { Screen } from './Screen'

// At phone widths Screen must render exactly what it did before ContentColumn existed:
// every width/centring class is web-prefixed, so native output carries none of them.
describe('Screen', () => {
  it('renders the same tree as before ContentColumn on native', async () => {
    const tree = await render(<Screen className="gap-3"><Text>hello</Text></Screen>)
    expect(tree.toJSON()).toMatchSnapshot()
  })
})

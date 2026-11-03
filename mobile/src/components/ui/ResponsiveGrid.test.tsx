import { render } from '@testing-library/react-native'
import { Text, useWindowDimensions, View } from 'react-native'
import { ResponsiveGrid } from './ResponsiveGrid'

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}))

const widthOf = async (screenWidth: number) => {
  ;(useWindowDimensions as jest.Mock).mockReturnValue({ width: screenWidth, height: 800, scale: 1, fontScale: 1 })
  const tree = await render(<ResponsiveGrid><Text>a</Text><Text>b</Text><Text>c</Text></ResponsiveGrid>)
  const container = tree.toJSON() as unknown as { children: { props: { style: { width: string } } }[] }
  return container.children[0].props.style.width
}

describe('ResponsiveGrid', () => {
  it('is one column on a phone, two from md, three from lg', async () => {
    expect(await widthOf(390)).toBe('100%')
    expect(await widthOf(768)).toBe('50%')
    expect(await widthOf(1280)).toBe(`${100 / 3}%`)
  })
})

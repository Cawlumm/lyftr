import { renderHook } from '@testing-library/react-native'
import { useWindowDimensions } from 'react-native'
import { useBreakpoint } from './useBreakpoint'

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}))

const mocked = useWindowDimensions as jest.Mock

describe('useBreakpoint', () => {
  const cases: [number, string, boolean[]][] = [
    [320, 'base', [false, false, false, false]],
    [390, 'base', [false, false, false, false]],
    [639, 'base', [false, false, false, false]],
    [640, 'sm', [true, false, false, false]],
    [768, 'md', [true, true, false, false]],
    [1024, 'lg', [true, true, true, false]],
    [1280, 'xl', [true, true, true, true]],
    [1920, 'xl', [true, true, true, true]],
  ]
  it.each(cases)('at %ipx is %s', async (width, current, flags) => {
    mocked.mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 })
    const { result } = await renderHook(() => useBreakpoint())
    expect(result.current.current).toBe(current)
    expect([result.current.sm, result.current.md, result.current.lg, result.current.xl]).toEqual(flags)
  })

  it('the tailwind screens come from the same file', () => {
    const screens = require('../../tailwind.config.js').theme.extend.screens
    expect(screens).toEqual({ sm: '640px', md: '768px', lg: '1024px', xl: '1280px' })
  })
})

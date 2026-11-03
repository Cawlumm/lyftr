import { isPlainClick, linkProps } from './link'

describe('linkProps', () => {
  it('is the same button on native, with no href and the bare handler', () => {
    const go = jest.fn()
    expect(linkProps('/workouts/1', go)).toEqual({ accessibilityRole: 'button', onPress: go })
  })
})

describe('isPlainClick', () => {
  it('leaves modified and non-primary clicks to the browser', () => {
    expect(isPlainClick({})).toBe(true)
    expect(isPlainClick({ button: 0 })).toBe(true)
    expect(isPlainClick({ button: 1 })).toBe(false)
    for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
      expect(isPlainClick({ [key]: true })).toBe(false)
    }
  })
})

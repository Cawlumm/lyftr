import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { IconButton } from './IconButton'
import { Plus } from './icons'
import { TOUCH_MIN, touchPad } from './interaction'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

// The pressable is the hit box, so it is padded out to TOUCH_MIN and the padding is given back
// as negative margin: a 32px button still takes 32px of layout.
describe('IconButton hit area', () => {
  it('pads a 32px button out to 44 and cancels it with margin', async () => {
    await render(<IconButton icon={Plus} label="Add" size="sm" />)
    const s = StyleSheet.flatten(screen.getByRole('button', { name: 'Add' }).props.style)
    expect(s.paddingHorizontal).toBe(6)
    expect(s.paddingVertical).toBe(6)
    expect(s.marginHorizontal).toBe(-6)
    expect(s.marginVertical).toBe(-6)
  })

  it('pads a 40px button by 2 and leaves a 48px one alone', async () => {
    await render(<><IconButton icon={Plus} label="md" size="md" /><IconButton icon={Plus} label="lg" size="lg" /></>)
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'md' }).props.style).paddingHorizontal).toBe(2)
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'lg' }).props.style).paddingHorizontal).toBe(0)
  })

  it('keeps the visual box when tight, for neighbours closer than 44px', async () => {
    await render(<IconButton icon={Plus} label="Add" size="sm" tight />)
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Add' }).props.style).paddingHorizontal).toBe(0)
  })

  it('still presses', async () => {
    const onPress = jest.fn()
    await render(<IconButton icon={Plus} label="Add" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('touchPad', () => {
  it('only grows the short side, and never shrinks one that is already enough', () => {
    expect(touchPad(100, 36)).toMatchObject({ paddingHorizontal: 0, paddingVertical: 4, marginVertical: -4 })
    expect(touchPad(TOUCH_MIN, TOUCH_MIN)).toMatchObject({ paddingHorizontal: 0, paddingVertical: 0 })
  })
})

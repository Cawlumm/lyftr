import { fireEvent, render, screen } from '@testing-library/react-native'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import { FoodHero, FoodThumb } from './FoodImage'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const SRC = 'https://images.openfoodfacts.org/x.jpg'
const images = () => screen.container.queryAll(n => n.type === 'Image')
const photo = () => images()[0]

// A photo OpenFoodFacts advertises but never delivers must not decide the layout, so
// "the src is set" is not what these assert on. Web's FoodImage.test.tsx pins the same.
describe('FoodHero', () => {
  it('takes no room at all when the food has no photo', async () => {
    await render(<FoodHero />)
    expect(images()).toHaveLength(0)
  })

  it('stays collapsed while the photo has not arrived', async () => {
    await render(<FoodHero src={SRC} />)
    expect(photo().props.className).toContain('h-0')
  })

  it('takes its full height once the photo loads', async () => {
    await render(<FoodHero src={SRC} />)
    await fireEvent(photo(), 'load')
    expect(photo().props.className).toContain('h-52')
  })
})

describe('FoodThumb', () => {
  it('shows only the glyph when there is no photo', async () => {
    await render(<FoodThumb />)
    expect(images()).toHaveLength(0)
  })

  it('keeps the glyph visible until the photo has loaded', async () => {
    await render(<FoodThumb src={SRC} />)
    expect(photo().props.style.opacity).toBe(0)
    await fireEvent(photo(), 'load')
    expect(photo().props.style.opacity).toBe(1)
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FoodHero, FoodThumb } from './FoodImage'

// What these pin is the failure that is invisible in a test that only checks the happy
// path: a photo OpenFoodFacts advertises but never delivers. Half its products have no
// photo at all, and its image host answers a fair share of the rest with a reset or a
// handshake that hangs — so "the src is set" must not be what decides the layout.
describe('FoodHero', () => {
  it('takes no room at all when the food has no photo', () => {
    const { container } = render(<FoodHero alt="Olive Oil" />)
    expect(container.firstChild).toBeNull()
  })

  // The band used to be reserved the moment a src existed, which on a phone pushed the
  // amount field off the screen for as long as the request hung — forever, in the case
  // that prompted this.
  it('stays collapsed while the photo has not arrived', () => {
    render(<FoodHero src="https://images.openfoodfacts.org/x.jpg" alt="Olive Oil" />)
    expect(screen.getByAltText('Olive Oil').className).toContain('h-0')
  })

  it('takes its full height once the photo loads', () => {
    render(<FoodHero src="https://images.openfoodfacts.org/x.jpg" alt="Olive Oil" />)
    fireEvent.load(screen.getByAltText('Olive Oil'))
    expect(screen.getByAltText('Olive Oil').className).toContain('h-52')
  })
})

describe('FoodThumb', () => {
  // The row's slot is a fixed square either way, so a list does not jitter as photos
  // stream in — the glyph sits underneath and the photo covers it once it is there.
  it('shows the glyph when there is no photo', () => {
    const { container } = render(<FoodThumb />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps the glyph visible until the photo has loaded', () => {
    const { container } = render(<FoodThumb src="https://images.openfoodfacts.org/x.jpg" />)
    const img = container.querySelector('img')!
    expect(img.className).toContain('opacity-0')
    fireEvent.load(img)
    expect(img.className).toContain('opacity-100')
  })
})

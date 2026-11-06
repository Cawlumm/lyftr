import { foodThumbUrl } from './offImage'

const BASE = 'https://images.openfoodfacts.org/images/products/500/031/600/0256'

describe('foodThumbUrl', () => {
  it('asks OFF for the 200px rendition of a selected 400px photo', () => {
    // Real urls from the search API; OFF's product API lists the .200 as image_small_url.
    expect(foodThumbUrl(`${BASE}/front_en.21.400.jpg`)).toBe(`${BASE}/front_en.21.200.jpg`)
    expect(foodThumbUrl('https://images.openfoodfacts.org/images/products/893/850/313/1957/front_vi.4.400.jpg'))
      .toBe('https://images.openfoodfacts.org/images/products/893/850/313/1957/front_vi.4.200.jpg')
  })

  it.each([
    ['no photo', undefined],
    ['empty', ''],
    ['another host', 'https://example.com/images/products/500/031/600/0256/front_en.21.400.jpg'],
    ['a look-alike host', 'https://images.openfoodfacts.org.evil.test/images/products/500/031/600/0256/front_en.21.400.jpg'],
    ['plain http', `http://images.openfoodfacts.org/images/products/500/031/600/0256/front_en.21.400.jpg`],
    ['already small', `${BASE}/front_en.21.200.jpg`],
    ['full size', `${BASE}/front_en.21.full.jpg`],
    ['a raw upload', `${BASE}/3.400.jpg`],
    ['a query string', `${BASE}/front_en.21.400.jpg?x=1`],
    ['an unsplit barcode', 'https://images.openfoodfacts.org/images/products/12345/front_en.3.400.jpg'],
    ['a fixture name', 'https://images.openfoodfacts.org/x.jpg'],
  ])('passes %s through unchanged', (_, url) => {
    expect(foodThumbUrl(url)).toBe(url)
  })
})

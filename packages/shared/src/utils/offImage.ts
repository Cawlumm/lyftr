// OpenFoodFacts serves every selected product photo at 100, 200, 400 and full size, and
// the search API hands us the 400. A 44-52px row thumb needs at most ~156 device px, so
// it asks for the 200 — the same file OFF's own product API returns as
// `image_small_url`. Scheme:
// https://openfoodfacts.github.io/openfoodfacts-server/api/how-to-download-images/
//
// Only a url that is exactly that scheme is rewritten. Anything else — another host,
// http, a raw upload, an unexpected name — goes through untouched, because a guessed
// url that 404s is worse than a large photo that loads.
const OFF_SELECTED_400 =
  /^(https:\/\/images\.openfoodfacts\.org\/images\/products\/\d{3}\/\d{3}\/\d{3}\/\d+\/[a-z]+_[a-z]{2}\.\d+\.)400(\.jpg)$/

export function foodThumbUrl(url: string): string
export function foodThumbUrl(url: string | undefined): string | undefined
export function foodThumbUrl(url: string | undefined): string | undefined {
  return url?.replace(OFF_SELECTED_400, '$1200$2')
}

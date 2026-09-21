import type { FoodLog, FoodSearchResult, SavedFood } from '../types'

// A logged entry stores macros for the servings the user actually ate; a
// FoodSearchResult is always per single serving, because the detail view multiplies
// it back by whatever `servings` is chosen. So re-logging a past entry has to divide
// out its serving count first — miss that and every re-log silently multiplies.
//
// This is the highest-drift piece of math in the app: it lives on one screen per
// platform, and a change to one side would mis-log food on the other with nothing
// failing. Hence one copy.
export function entryToResult(e: FoodLog): FoodSearchResult {
  const s = e.servings || 1
  return {
    name: e.name,
    brand: e.brand ?? '',
    calories: e.calories / s,
    protein: e.protein / s,
    carbs: e.carbs / s,
    fat: e.fat / s,
    fiber: (e.fiber ?? 0) / s,
    serving_size: e.serving_size ?? '',
    // Carried so re-opening an entry can still offer entry by weight. Unlike the
    // macros these are per *one* serving already, so they do not divide.
    serving_quantity: e.serving_quantity,
    serving_unit: e.serving_unit,
    barcode: e.barcode,
    image_url: e.image_url,
    source: 'saved',
  }
}

// The inverse of entryToResult: scale a per-serving result back up by the servings the
// user is logging. Sharing only the divide half would have left the two directions free
// to drift apart, which is the exact failure this pair exists to prevent — a re-logged
// entry would round-trip to different macros than it started with.
//
// toFixed(1) matches the 0.1 precision used everywhere else numbers are entered.
export function scaleServing(r: FoodSearchResult, servings: number) {
  return {
    name: r.name || 'Custom entry',
    // Carried onto the log so a diary entry still knows which product it was. Without
    // it every Recent row compares as brand '', so a branded favourite shows an empty
    // star there and starring it creates a second, brandless row.
    brand: r.brand ?? '',
    calories: +(r.calories * servings).toFixed(1),
    protein: +(r.protein * servings).toFixed(1),
    carbs: +(r.carbs * servings).toFixed(1),
    fat: +(r.fat * servings).toFixed(1),
    fiber: +((r.fiber ?? 0) * servings).toFixed(1),
    servings,
    serving_size: r.serving_size ?? '',
    serving_quantity: r.serving_quantity ?? 0,
    serving_unit: r.serving_unit ?? '',
    barcode: r.barcode ?? '',
    image_url: r.image_url ?? '',
  }
}

/** A serving expressed as a number, so an amount can be scaled against it. */
export interface ServingBasis {
  quantity: number
  unit: 'g' | 'ml'
}

// What one serving of this food weighs (or measures), or null when nothing knows.
//
// OpenFoodFacts has a serving but no size for thousands of products, and everything
// logged before #171 stored none either. Both read back as 0, and 0 is not a basis you
// can divide by — the screens fall back to servings, which is what they have always
// done. Never substitute 100 here: that is a real number for a product whose figures
// are per 100 g and a fiction for one whose serving is a tablespoon.
export function servingBasis(r: Pick<FoodSearchResult, 'serving_quantity' | 'serving_unit'>): ServingBasis | null {
  const quantity = r.serving_quantity ?? 0
  if (!(quantity > 0)) return null
  return { quantity, unit: r.serving_unit === 'ml' ? 'ml' : 'g' }
}

// Amount (in the basis' unit) → servings, which is what the log stores and what
// scaleServing multiplies by. The diary has always been in servings; weight is a way
// to type one, not a second thing to store.
export function servingsForAmount(amount: number, basis: ServingBasis): number {
  return amount / basis.quantity
}

// Servings as a number to read, not to compute with: a third of a serving is
// 0.3333333333333333 and nobody needs that.
//
// Two decimals is enough for everything except a very small amount of a food measured
// per 100 — 0.4 ml of oil is 0.004 servings, which rounds to "0 servings" beside a
// figure of 3 kcal. Falling back to one significant digit keeps that honest.
export function formatServings(servings: number): number {
  const rounded = +servings.toFixed(2)
  if (rounded === 0 && servings > 0) return +servings.toPrecision(1)
  return rounded
}

// The inverse, for showing the amount when a screen opens on an existing entry.
// Rounded to 0.1 to match the precision every other number in the app is entered at;
// without it a third of a serving opens the field as 33.33333333333333 g.
export function amountForServings(servings: number, basis: ServingBasis): number {
  return +(servings * basis.quantity).toFixed(1)
}

// How much of the food an entry records, in the unit it was logged in: "15 ml" when
// the serving's size is known, "0.5 servings" when it is not. One copy, because the
// diary row and the entry detail have to read the same or the same tablespoon of oil
// appears as two different amounts on two screens.
export function formatLoggedAmount(
  e: Pick<FoodLog, 'servings'> & Pick<FoodSearchResult, 'serving_quantity' | 'serving_unit'>,
): string {
  const servings = e.servings || 1
  const basis = servingBasis(e)
  if (basis) return `${amountForServings(servings, basis)} ${basis.unit}`
  const n = formatServings(servings)
  return `${n} ${n === 1 ? 'serving' : 'servings'}`
}

// A saved food is already stored per serving, so it maps across untouched.
export function savedToResult(s: SavedFood): FoodSearchResult {
  return {
    name: s.name, brand: s.brand,
    calories: s.calories, protein: s.protein, carbs: s.carbs,
    fat: s.fat, fiber: s.fiber, serving_size: s.serving_size,
    serving_quantity: s.serving_quantity, serving_unit: s.serving_unit,
    barcode: s.barcode, source: 'saved',
  }
}

// Which saved food, if any, is the same favourite as `item`.
//
// Starring stores the unscaled food and the servings stepper scales at log time, so
// "same food" is name + brand, and nothing else. Matched exactly, mirroring the
// UNIQUE(user_id, name, brand) index the server enforces: if the two disagreed, the
// client would offer a star the server then refuses to create as new.
//
// Brand is normalised to '' because that is what the API stores for a food with no
// brand, while a search result can carry undefined.
export function findSavedFood(
  saved: SavedFood[],
  item: Pick<FoodSearchResult, 'name' | 'brand'>,
): SavedFood | undefined {
  const name = normaliseFoodKey(item.name)
  const brand = normaliseFoodKey(item.brand)
  return saved.find(s => normaliseFoodKey(s.name) === name && normaliseFoodKey(s.brand) === brand)
}

// The two ceilings on one diary entry. Typing 999999 into the amount field read
// 7,999,992 kcal against the day, and the server stored whatever arrived.
//
// MAX_SERVINGS is the one that matters, because servings is what gets stored and what
// every macro is multiplied by — it is also what the server enforces (models.MaxServings).
// This copy exists so the field can refuse before asking.
//
// MAX_AMOUNT exists because the servings ceiling alone is slack for a food held per
// 100 g: a thousand servings of one is a hundred kilos, so 99999 g still logged ~800,000
// kcal. It is OpenNutriTracker's number — their sheet refuses anything over 10000 as
// "unrealistically high" — and it is the only bound any peer puts on a weight. (wger caps
// its amount at 1000, but that column doubles as a portion multiplier, which is why it
// also carries a MinValueValidator of 1 and so cannot log half a slice or a gram of
// anything — the very complaint #41 raised here. Waistline and FitBook have no maximum
// at all.)
//
// Both are checked after the amount is converted, not before. OpenNutriTracker checks
// the typed number instead, so "500 servings" of a 30 g portion passes their guard and
// stores 15000 g.
export const MAX_SERVINGS = 1000
export const MAX_AMOUNT = 10000

// The binding ceiling, expressed in whatever the field is showing, for the message.
export function maxAmountFor(basis: ServingBasis | null): string {
  if (!basis) return `${MAX_SERVINGS} servings`
  const max = Math.min(MAX_AMOUNT, MAX_SERVINGS * basis.quantity)
  return `${+max.toFixed(1)} ${basis.unit}`
}

// React's key for one row of search or recent results, in both apps.
//
// The barcode is the only stable identity a result has. Keying on name + calories put
// two real products under one key — OpenFoodFacts returns several "Extra Virgin Olive
// Oil" rows from different brands, two of which read 0 kcal — and React answered with
// "Encountered two children with the same key", having quietly dropped one row's state
// onto the other.
//
// Without a barcode (a hand-entered food, a recent entry logged before barcodes were
// stored) there is nothing unique to key on, so the position stands in. That is only
// sound because these lists are replaced wholesale by a fetch rather than reordered.
export function foodResultKey(
  item: Pick<FoodSearchResult, 'barcode' | 'name'>,
  index: number,
): string {
  return item.barcode || `${index}:${normaliseFoodKey(item.name)}`
}

// The single definition of "the same food", client-side. It has to agree with the
// server, which trims before storing — otherwise a search result carrying "Oats " reads
// as different from the stored "Oats", the star shows unfilled next to a food that is
// already favourited, and tapping it asks the server to create something it will refuse
// as a duplicate.
//
// Trim only. Case is deliberately significant, matching the UNIQUE(user_id, name, brand)
// index: folding it here would hide a favourite the server would happily create.
export function normaliseFoodKey(value: string | undefined): string {
  return (value ?? '').trim()
}

// A 200 is not the same as an answer we can read.
//
// The day's totals are fetched with a `.catch` that substitutes zeros, which handles a
// 500 — but a response that succeeds and carries the wrong shape never reaches it. The
// web dashboard then ran Math.round over a missing field and rendered "NaN" beside the
// calorie ring, and the food screen rendered "0", which is the "hasn't eaten yet" lie
// this whole change exists to remove.
//
// So the shape is checked where the value is read, and anything unreadable is treated as
// a failed load rather than as data. Every macro a screen renders is required — the
// dashboard's macro rows read carbs and fat too, so checking only calories and protein
// let a payload missing those through to render NaN. Extra fields are still fine: a server
// that grows one must not make an older client call the payload broken.
// A scanned code, grouped the way it is printed under the bars on the pack, so the
// person can check it against the jar in their hand: EAN-13 `3 017620 422003`, UPC-A
// `0 12345 67890 5`, EAN-8 `1234 5670`. Anything else is shown as scanned.
export function formatBarcode(code: string): string {
  if (!/^\d+$/.test(code)) return code
  switch (code.length) {
    case 13: return `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}`
    case 12: return `${code[0]} ${code.slice(1, 6)} ${code.slice(6, 11)} ${code[11]}`
    case 8: return `${code.slice(0, 4)} ${code.slice(4)}`
    default: return code
  }
}

// The bars of an EAN-13 (or UPC-A, which is EAN-13 with a leading 0), as 95 modules,
// '1' for a bar — so a screen can draw the barcode that was scanned rather than a
// generic glyph. Null for anything else; callers fall back to an icon.
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

export function eanModules(code: string): string | null {
  const c = code.length === 12 ? `0${code}` : code
  if (!/^\d{13}$/.test(c)) return null
  const parity = EAN_PARITY[Number(c[0])]
  let bits = '101'
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[Number(c[i])]
  bits += '01010'
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(c[i])]
  return `${bits}101`
}

const RENDERED_MACROS = ['total_calories', 'total_protein', 'total_carbs', 'total_fat'] as const

export function isDailyStats(value: unknown): value is import('../types').DailyStats {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return RENDERED_MACROS.every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))
}

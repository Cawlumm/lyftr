import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LogFood from './LogFood'
import type { FoodSearchResult } from '@lyftr/shared'

// What the page sends to the API: scaleServing's fields plus where and when.
type LoggedPayload = ReturnType<typeof import('@lyftr/shared').scaleServing> & {
  meal: string
  logged_at: string
}

// A barcode lookup goes through Open Food Facts and takes seconds. The bug these pin
// (#164): the scanner closed and the screen sat unchanged while it ran, so people
// rescanned three or four times thinking it had failed — and when it did fail for a
// reason other than "no such product", it said "Product not found" anyway.

const barcode = vi.fn()
const search = vi.fn(async (_q: string): Promise<FoodSearchResult[]> => [])
const logFood = vi.fn(async (_payload: LoggedPayload) => ({}))

vi.mock('../services/api', () => ({
  foodAPI: {
    list: () => Promise.resolve([]),
    search: (q: string) => search(q),
    barcode: (code: string) => barcode(code),
    get: vi.fn(),
    log: (payload: LoggedPayload) => logFood(payload),
    update: vi.fn(),
  },
  savedFoodsAPI: {
    list: () => Promise.resolve([]),
    create: vi.fn(),
    delete: vi.fn(),
  },
}))

// The real scanner needs a camera. This one hands back a code the way it would.
vi.mock('../components/BarcodeScanner', () => ({
  default: ({ onResult }: { onResult: (code: string) => void }) => (
    <button onClick={() => onResult('3017620422003')}>Simulate scan</button>
  ),
}))

const renderPage = () => render(<MemoryRouter><LogFood /></MemoryRouter>)

const scan = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Scan barcode' }))
  fireEvent.click(screen.getByRole('button', { name: 'Simulate scan' }))
}

const scanButton = () => screen.getByRole('button', { name: 'Scan barcode' }) as HTMLButtonElement

const httpError = (status: number, error?: string) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data: error ? { error } : {} } })

const TIMEOUT = "The food database didn't respond in time. Try again."

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Barcode lookup', () => {
  it('shows the scanned code while it is looked up, and blocks a second scan', async () => {
    barcode.mockReturnValue(new Promise(() => {}))
    renderPage()

    await scan()

    // The code, grouped as printed on the pack, is the proof the scan landed.
    expect(await screen.findByText('3 017620 422003')).toBeTruthy()
    expect(screen.getByText('Looking up this product…')).toBeTruthy()
    expect(scanButton().disabled).toBe(true)
  })

  it("says what actually went wrong when the lookup fails, not that the product doesn't exist", async () => {
    barcode.mockRejectedValue(httpError(503, TIMEOUT))
    renderPage()

    await scan()

    expect(await screen.findByText("Couldn't look up this barcode")).toBeTruthy()
    expect(screen.getByText(TIMEOUT)).toBeTruthy()
    expect(screen.queryByText(/not found/i)).toBeNull()
    expect(scanButton().disabled).toBe(false)
  })

  it('retries the same code without asking for another scan', async () => {
    barcode.mockRejectedValueOnce(httpError(503, TIMEOUT))
    barcode.mockResolvedValueOnce({ name: 'Nutella', calories: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: 0, serving_size: '100 g', source: 'off' })
    renderPage()

    await scan()
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Nutella')).toBeTruthy()
    expect(barcode).toHaveBeenCalledTimes(2)
    expect(barcode).toHaveBeenLastCalledWith('3017620422003')
  })

  it('lets a failed lookup be entered by hand instead', async () => {
    barcode.mockRejectedValue(httpError(503, TIMEOUT))
    renderPage()

    await scan()
    fireEvent.click(await screen.findByRole('button', { name: 'Enter it manually' }))

    expect(await screen.findByText('New Entry')).toBeTruthy()
  })

  it('clears a failed lookup once the person starts searching instead', async () => {
    barcode.mockRejectedValue(httpError(503, TIMEOUT))
    renderPage()

    await scan()
    await screen.findByText("Couldn't look up this barcode")
    fireEvent.change(screen.getByPlaceholderText('Search food…'), { target: { value: 'oats' } })

    await waitFor(() => expect(screen.queryByText("Couldn't look up this barcode")).toBeNull())
  })

  it('opens a blank entry to fill in when the product really is not in the database', async () => {
    barcode.mockRejectedValue(httpError(404, 'No product matched that barcode.'))
    renderPage()

    await scan()

    expect(await screen.findByText('New Entry')).toBeTruthy()
  })
})


// #171: a bottle of olive oil read 800 kcal and 93.3 g fat for "1 serving", because
// OpenFoodFacts only has per-100ml figures for it — and the servings field floored at
// 0.5, so the smallest thing anyone could log was half of that. 15 ml was unreachable.
describe('Logging an amount', () => {
  const OIL_SEARCH_HIT: FoodSearchResult = {
    name: 'Olive Oil', brand: 'Thrive Market',
    calories: 800, protein: 0, carbs: 0, fat: 93.3, fiber: 0,
    serving_size: '100 ml', serving_quantity: 100, serving_unit: 'ml',
    barcode: '0085239033265', source: 'off',
  }
  const OIL_PRODUCT: FoodSearchResult = {
    ...OIL_SEARCH_HIT,
    calories: 120, fat: 14,
    serving_size: '1 Tbsp (15 ml)', serving_quantity: 15,
  }

  const searchFor = async (term: string) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByPlaceholderText('Search food…'), { target: { value: term } })
  }

  const logButton = () => screen.getByRole('button', { name: 'Log Food' }) as HTMLButtonElement

  it('logs the amount typed, not a multiple of half a serving', async () => {
    search.mockResolvedValue([OIL_SEARCH_HIT])
    barcode.mockResolvedValue(OIL_PRODUCT)
    renderPage()

    await searchFor('olive oil')
    fireEvent.click(await screen.findByText('Olive Oil'))

    const amount = await screen.findByLabelText('Amount in ml') as HTMLInputElement
    // One serving of the product, which is what the field opens on.
    expect(amount.value).toBe('15')

    fireEvent.change(amount, { target: { value: '5' } })
    expect(screen.getByText(/0\.33 servings/)).toBeTruthy()

    fireEvent.click(logButton())
    await waitFor(() => expect(logFood).toHaveBeenCalled())
    const payload = logFood.mock.calls[0][0]
    expect(payload.servings).toBeCloseTo(1 / 3)
    expect(payload.calories).toBe(40)
    expect(payload.serving_quantity).toBe(15)
    expect(payload.serving_unit).toBe('ml')
  })

  // Deleting the 0.5-serving floor made an empty or nonsense amount reachable for the
  // first time. The button has to refuse it — and say so, rather than sit there dead
  // next to "0 servings", which states what happened and not why.
  it.each([
    ['empty', ''],
    ['zero', '0'],
    ['negative', '-3'],
  ])('refuses to log an %s amount, and says what it wants instead', async (_label, typed) => {
    search.mockResolvedValue([OIL_SEARCH_HIT])
    barcode.mockResolvedValue(OIL_PRODUCT)
    renderPage()

    await searchFor('olive oil')
    fireEvent.click(await screen.findByText('Olive Oil'))

    const amount = await screen.findByLabelText('Amount in ml') as HTMLInputElement
    fireEvent.change(amount, { target: { value: typed } })

    expect(logButton().disabled).toBe(true)
    expect(screen.getByText('Enter an amount in ml to log this')).toBeTruthy()
    // And the header stops claiming a zero-sized serving.
    expect(screen.queryByText(/0 × /)).toBeNull()
  })

  // The other end of the same field. A fat-fingered 999999 read 7,999,992 kcal against
  // the day and the server stored it, because neither side had a ceiling.
  it('refuses an amount larger than one entry can hold', async () => {
    search.mockResolvedValue([OIL_SEARCH_HIT])
    barcode.mockResolvedValue(OIL_PRODUCT)
    renderPage()

    await searchFor('olive oil')
    fireEvent.click(await screen.findByText('Olive Oil'))

    const amount = await screen.findByLabelText('Amount in ml') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '999999' } })

    expect(logButton().disabled).toBe(true)
    // Said in millilitres, which is what the field is showing.
    expect(screen.getByText('One entry holds at most 10000 ml')).toBeTruthy()

    // And the limit itself still logs.
    fireEvent.change(amount, { target: { value: '10000' } })
    expect(logButton().disabled).toBe(false)
  })

  // The search index answers with per-100g figures and no serving at all, so a hit is
  // not what the pack says. Selecting one has to read the product in full first.
  it('re-reads a search hit through the product endpoint before opening it', async () => {
    search.mockResolvedValue([OIL_SEARCH_HIT])
    barcode.mockResolvedValue(OIL_PRODUCT)
    renderPage()

    await searchFor('olive oil')
    fireEvent.click(await screen.findByText('Olive Oil'))

    await waitFor(() => expect(barcode).toHaveBeenCalledWith('0085239033265'))
    // The pack's own serving, not the index's 100 ml. The label is assembled from
    // several nodes, so it is read off the whole paragraph.
    const amount = await screen.findByLabelText('Amount in ml') as HTMLInputElement
    expect(amount.value).toBe('15')
    expect(screen.getByText('120')).toBeTruthy()
    expect(screen.getByText(
      (_, el) => el?.textContent === '1 serving of 1 Tbsp (15 ml)',
    )).toBeTruthy()
  })

  it('still opens the search figures when that re-read fails, and says which they are', async () => {
    search.mockResolvedValue([OIL_SEARCH_HIT])
    barcode.mockRejectedValue(httpError(503, TIMEOUT))
    renderPage()

    await searchFor('olive oil')
    fireEvent.click(await screen.findByText('Olive Oil'))

    expect(await screen.findByText(new RegExp(TIMEOUT))).toBeTruthy()
    expect(screen.getByText(/always per 100 ml/)).toBeTruthy()
    // Still loggable: the per-100 figures are real, they are just not a pack serving.
    const amount = screen.getByLabelText('Amount in ml') as HTMLInputElement
    expect(amount.value).toBe('100')
    fireEvent.change(amount, { target: { value: '15' } })
    fireEvent.click(logButton())
    await waitFor(() => expect(logFood).toHaveBeenCalled())
    expect(logFood.mock.calls[0][0].servings).toBeCloseTo(0.15)
  })

  // Nothing knows what a serving of a hand-entered food weighs, so it stays in
  // servings — but unfloored, which is the other half of the bug.
  it('falls back to servings when no serving size is known, with no minimum', async () => {
    search.mockResolvedValue([])
    renderPage()

    await searchFor('sourdough')
    fireEvent.click(await screen.findByRole('button', { name: /Enter "sourdough" manually/ }))

    const servings = await screen.findByLabelText('Servings') as HTMLInputElement
    expect(servings.value).toBe('1')
    fireEvent.change(servings, { target: { value: '0.25' } })
    fireEvent.click(logButton())
    await waitFor(() => expect(logFood).toHaveBeenCalled())
    expect(logFood.mock.calls[0][0].servings).toBe(0.25)
  })

})

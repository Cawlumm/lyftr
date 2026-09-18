import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LogFood from './LogFood'

// A barcode lookup goes through Open Food Facts and takes seconds. The bug these pin
// (#164): the scanner closed and the screen sat unchanged while it ran, so people
// rescanned three or four times thinking it had failed — and when it did fail for a
// reason other than "no such product", it said "Product not found" anyway.

const barcode = vi.fn()

vi.mock('../services/api', () => ({
  foodAPI: {
    list: () => Promise.resolve([]),
    search: () => Promise.resolve([]),
    barcode: (code: string) => barcode(code),
    get: vi.fn(),
    log: vi.fn(),
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

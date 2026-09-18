import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    <button onClick={() => onResult('0123456789012')}>Simulate scan</button>
  ),
}))

const renderPage = () => render(<MemoryRouter><LogFood /></MemoryRouter>)

const scan = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Scan barcode' }))
  fireEvent.click(screen.getByRole('button', { name: 'Simulate scan' }))
}

const httpError = (status: number, error?: string) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data: error ? { error } : {} } })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Barcode lookup', () => {
  it('shows the lookup is running, and blocks a second scan while it does', async () => {
    barcode.mockReturnValue(new Promise(() => {}))
    renderPage()

    await scan()

    expect(await screen.findByText('Looking up barcode…')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Scan barcode' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("says what actually went wrong when the lookup fails, not that the product doesn't exist", async () => {
    barcode.mockRejectedValue(httpError(503, "The food database didn't respond in time. Try again."))
    renderPage()

    await scan()

    expect(await screen.findByText("The food database didn't respond in time. Try again.")).toBeTruthy()
    expect(screen.queryByText(/not found/i)).toBeNull()
    expect(screen.queryByText('Looking up barcode…')).toBeNull()
    expect((screen.getByRole('button', { name: 'Scan barcode' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('opens a blank entry to fill in when the product really is not in the database', async () => {
    barcode.mockRejectedValue(httpError(404, 'No product matched that barcode.'))
    renderPage()

    await scan()

    expect(await screen.findByText('New Entry')).toBeTruthy()
  })
})

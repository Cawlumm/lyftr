import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Weight from './Weight'

// Each figure on this screen comes from exactly one read: on "All" the server aggregate
// from /weight/stats, on every other period the period-scoped trend list. The bug these
// pin: the tiles were keyed on *either* read having failed, so a dead trend beside a
// healthy stats call rendered "0 lb" — a measurement, in the same type as a real one —
// under a line claiming it was the last figure we had loaded.

const list = vi.fn()
const stats = vi.fn()

vi.mock('../services/api', () => ({
  weightAPI: {
    list: (...args: unknown[]) => list(...args),
    stats: () => stats(),
    log: vi.fn(),
    delete: vi.fn(),
  },
}))

// The history list underneath: not what these tests are about, and left healthy so the
// page never reaches its whole-screen error.
const HISTORY = [
  { id: 1, weight: 183, logged_at: '2026-08-29T12:00:00Z', logged_on: '2026-08-29', notes: '' },
  { id: 2, weight: 181, logged_at: '2026-08-27T12:00:00Z', logged_on: '2026-08-27', notes: '' },
]

const renderPage = () => render(<MemoryRouter><Weight /></MemoryRouter>)

// The trend call is the one carrying limit: 1000; the paged history list is not.
const isTrendCall = (args: unknown[]) =>
  typeof args[0] === 'object' && args[0] !== null && (args[0] as { limit?: number }).limit === 1000

beforeEach(() => {
  vi.clearAllMocks()
  stats.mockResolvedValue({
    latest: 183, starting: 181, avg: 182, min: 181, max: 183, change_7d: 2, total_entries: 2,
  })
})

describe('Weight figures', () => {
  it('marks the tiles as failed when the read behind them died, instead of showing 0', async () => {
    list.mockImplementation((...args: unknown[]) =>
      isTrendCall(args) ? Promise.reject(new Error('trend is down')) : Promise.resolve(HISTORY))

    renderPage()

    // One mark per tile (Avg, Low, High), and no invented measurement in their place.
    await waitFor(() => {
      expect(screen.getAllByLabelText(/Couldn't load (avg|low|high) weight/i)).toHaveLength(3)
    })
    expect(screen.queryByText('0')).toBeNull()
    // Nothing was loaded, so nothing can be "the last we loaded".
    expect(screen.queryByText(/showing the last we loaded/i)).toBeNull()
  })

  it('keeps the server aggregate on All when only the trend read failed', async () => {
    list.mockImplementation((...args: unknown[]) =>
      isTrendCall(args) ? Promise.reject(new Error('trend is down')) : Promise.resolve(HISTORY))

    const { container } = renderPage()
    await waitFor(() => expect(stats).toHaveBeenCalled())

    // On All the tiles read /weight/stats, which answered — so they hold real figures
    // and the trend's failure is confined to the chart.
    const all = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'All')
    expect(all).toBeTruthy()
    all!.click()

    await waitFor(() => {
      expect(screen.getByText('182')).toBeTruthy()  // avg, from the aggregate
    })
    expect(screen.queryByLabelText(/Couldn't load avg weight/i)).toBeNull()
  })

  it('does not label another period as the one on screen when a switch fails', async () => {
    // Every window answers except the one we switch to.
    const ninetyDaysAgo = daysAgo(90)
    list.mockImplementation((...args: unknown[]) => {
      if (!isTrendCall(args)) return Promise.resolve(HISTORY)
      const from = (args[0] as { from?: string }).from
      return from === ninetyDaysAgo ? Promise.reject(new Error('trend is down')) : Promise.resolve(HISTORY)
    })

    const { container } = renderPage()
    // 30d's own figures are on screen first (the average of 183 and 181).
    await waitFor(() => expect(screen.getAllByText('182').length).toBeGreaterThan(0))
    expect(screen.queryByLabelText(/Couldn't load avg weight/i)).toBeNull()

    const ninety = Array.from(container.querySelectorAll('button')).find(b => b.textContent === '90d')
    ninety!.click()

    // 30d's figures must not reappear under the 90d label; the failure takes their place.
    await waitFor(() => {
      expect(screen.getAllByLabelText(/Couldn't load (avg|low|high) weight/i)).toHaveLength(3)
    })
    expect(screen.queryByText(/showing the last we loaded/i)).toBeNull()
  })
})

// The page asks for its window as a `from` day; mirror that rather than freezing a date.
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

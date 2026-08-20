import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ExercisePicker from './ExercisePicker'
import { types } from '@lyftr/shared'

type ListParams = {
  q?: string
  muscle_group?: string
  category?: string
  equipment?: string
  limit?: number
  page?: number
}

const listMock = vi.fn()
vi.mock('../services/api', () => ({
  exerciseAPI: { list: (params?: ListParams) => listMock(params) },
}))

// @tanstack/react-virtual measures a real scroll container, which jsdom has no
// layout for — every row would render at zero height and none would be visible.
// Reporting one row per loaded exercise keeps the list assertable without making
// the test about virtualization.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 64,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 64, size: 64 })),
  }),
}))

const exercise = (id: number, name: string): types.Exercise => ({
  id,
  name,
  muscle_group: 'quadriceps',
  secondary_muscles: [],
  category: 'strength',
  equipment: 'barbell',
  description: '',
})

// A page of exactly PAGE_SIZE rows, so the component does not treat it as the end.
const fullPage = (prefix: string) =>
  Array.from({ length: 50 }, (_, i) => exercise(i + 1, `${prefix} ${i + 1}`))

beforeEach(() => {
  listMock.mockReset()
})

describe('ExercisePicker', () => {
  // The picker opens with an unfiltered first page in flight. If typing a query
  // while that request is outstanding is treated as "a load is already running,
  // skip it", the search is silently dropped: the user is left looking at the
  // alphabetical first page, having typed a query that appears to do nothing. This
  // is not hypothetical — it took an e2e run 30s to fail on exactly this.
  it('runs a search typed while the initial page is still loading', async () => {
    let releaseInitial: (v: types.Exercise[]) => void = () => {}
    listMock
      .mockImplementationOnce(() => new Promise(resolve => { releaseInitial = resolve }))
      .mockImplementation(() => Promise.resolve([exercise(999, 'Barbell Squat')]))

    render(<ExercisePicker selectedIds={[]} onSelect={() => {}} onClose={() => {}} />)

    // Type before the first page resolves.
    fireEvent.change(screen.getByPlaceholderText(/search exercises/i), { target: { value: 'squat' } })

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ q: 'squat', page: 1 }))
    })

    releaseInitial(fullPage('Unfiltered'))

    expect(await screen.findByText('Barbell Squat')).toBeTruthy()
  })

  // A slow earlier response must not overwrite a newer one. Without a sequence
  // guard the list ends up showing results for a query the user has moved past.
  it('ignores a stale response that arrives after a newer one', async () => {
    let releaseFirst: (v: types.Exercise[]) => void = () => {}
    listMock
      .mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve }))
      .mockImplementation(() => Promise.resolve([exercise(2, 'Front Squat')]))

    render(<ExercisePicker selectedIds={[]} onSelect={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/search exercises/i), { target: { value: 'squat' } })

    expect(await screen.findByText('Front Squat')).toBeTruthy()

    // The initial unfiltered page lands late; it must not replace the search results.
    releaseFirst([exercise(1, 'Stale Unfiltered Row')])

    await waitFor(() => {
      expect(screen.queryByText('Stale Unfiltered Row')).toBeNull()
    })
    expect(screen.getByText('Front Squat')).toBeTruthy()
  })

  it('asks the server for each page rather than filtering locally', async () => {
    listMock.mockResolvedValue(fullPage('Exercise'))
    render(<ExercisePicker selectedIds={[]} onSelect={() => {}} onClose={() => {}} />)

    await waitFor(() => expect(listMock).toHaveBeenCalled())
    // page is always explicit, and no call asks for the whole catalog.
    for (const call of listMock.mock.calls) {
      expect(call[0]).toHaveProperty('page')
      expect(call[0]?.limit ?? 50).toBeLessThanOrEqual(100)
    }
  })
})

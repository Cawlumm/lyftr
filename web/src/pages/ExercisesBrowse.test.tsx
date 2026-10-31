import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ExercisesBrowse from './ExercisesBrowse'
import { types } from '@lyftr/shared'

const listMock = vi.fn()
vi.mock('../services/api', () => ({
  exerciseAPI: { list: (params?: Record<string, unknown>) => listMock(params) },
}))

const exercise = (id: number, name: string, muscle = 'chest', equipment = 'barbell'): types.Exercise => ({
  id,
  name,
  muscle_group: muscle,
  secondary_muscles: [],
  category: 'strength',
  equipment,
  description: '',
})

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname + loc.search}</output>
}

const renderPage = (url = '/exercises') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/exercises" element={<ExercisesBrowse />} />
      <Route path="/exercises/:id" element={<div>detail page</div>} />
    </Routes>
    <Where />
  </MemoryRouter>
)

beforeEach(() => {
  listMock.mockReset()
  listMock.mockResolvedValue([exercise(1, 'Bench Press')])
})

describe('ExercisesBrowse', () => {
  it('lists exercises as links to their detail page, with no add-to-workout step', async () => {
    renderPage()
    const row = await screen.findByRole('link', { name: /bench press/i })
    expect(row.getAttribute('href')).toBe('/exercises/1')
  })

  it('asks for an unfiltered first page, sending no empty filter params', async () => {
    renderPage()
    await screen.findByText('Bench Press')
    expect(listMock).toHaveBeenCalledWith({ page: 1 })
  })

  it('sends the muscle and equipment chips to the server, and clears them again', async () => {
    renderPage()
    await screen.findByText('Bench Press')

    fireEvent.click(screen.getByRole('button', { name: 'chest', pressed: false }))
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith({ muscle_group: 'chest', page: 1 }))

    fireEvent.click(screen.getByRole('button', { name: 'Dumbbell', pressed: false }))
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith({ muscle_group: 'chest', equipment: 'dumbbell', page: 1 }))

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith({ page: 1 }))
  })

  it('tapping the active chip again turns it off', async () => {
    renderPage()
    await screen.findByText('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'chest' }))
    fireEvent.click(await screen.findByRole('button', { name: 'chest', pressed: true }))
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith({ page: 1 }))
  })

  it('searches by name alongside the chips', async () => {
    renderPage()
    await screen.findByText('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'chest' }))
    fireEvent.change(screen.getByPlaceholderText(/search exercises/i), { target: { value: 'press' } })
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith({ q: 'press', muscle_group: 'chest', page: 1 }))
  })

  // An empty chip result must not read as an empty library: that answer offers "Try
  // again" and says the library is still loading, which is false when the server answered.
  it('says no exercise matches when a filter returns nothing, not that the library is empty', async () => {
    renderPage()
    await screen.findByText('Bench Press')
    listMock.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: 'calves' }))
    expect(await screen.findByText(/no exercises match/i)).toBeTruthy()
    expect(screen.queryByText(/still loading/i)).toBeNull()
  })

  it('says the library is still loading when an unfiltered list is empty', async () => {
    listMock.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/still loading/i)).toBeTruthy()
  })

  it('shows the failure, not an empty list, when the request fails', async () => {
    listMock.mockRejectedValue(new Error('network'))
    renderPage()
    expect(await screen.findByRole('button', { name: /retry|try again/i })).toBeTruthy()
    expect(screen.queryByText(/no exercises/i)).toBeNull()
  })

  // Opening an exercise unmounts the page. The filters have to come back with it, or
  // looking at three chest exercises means re-picking Chest three times.
  it('restores search and chips from the URL, and asks the server for them on first load', async () => {
    renderPage('/exercises?q=press&muscle=chest&equipment=dumbbell')
    await screen.findByText('Bench Press')
    expect(listMock).toHaveBeenCalledWith({ q: 'press', muscle_group: 'chest', equipment: 'dumbbell', page: 1 })
    expect((screen.getByPlaceholderText(/search exercises/i) as HTMLInputElement).value).toBe('press')
    expect(screen.getByRole('button', { name: 'chest', pressed: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dumbbell', pressed: true })).toBeTruthy()
  })

  it('writes the chips and the search to the URL without piling up history entries', async () => {
    renderPage()
    await screen.findByText('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'chest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Barbell' }))
    fireEvent.change(screen.getByPlaceholderText(/search exercises/i), { target: { value: ' bench ' } })
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe('/exercises?muscle=chest&equipment=barbell&q=bench'))
  })

  it('drops a filter from the URL when its chip is cleared', async () => {
    renderPage('/exercises?muscle=chest&equipment=barbell')
    await screen.findByText('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/exercises'))
  })

  it('ignores a muscle that is not one of the chips rather than filtering to nothing', async () => {
    renderPage('/exercises?muscle=bogus&equipment=nonsense')
    await screen.findByText('Bench Press')
    expect(listMock).toHaveBeenCalledWith({ page: 1 })
  })
})

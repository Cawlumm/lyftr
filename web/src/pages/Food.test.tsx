import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Food from './Food'

// Starring from the diary (#138): a logged entry is starred as the food it is — one
// serving, the same row the Recent, Favorites and Search tabs would star.

const list = vi.fn()
const savedList = vi.fn()
const savedCreate = vi.fn()
const savedDelete = vi.fn()

vi.mock('../services/api', () => ({
  foodAPI: {
    list: (...a: unknown[]) => list(...a),
    stats: () => Promise.resolve({ date: '2026-09-18', total_calories: 900, total_protein: 30, total_carbs: 150, total_fat: 15, total_fiber: 9, workout_count: 0 }),
    history: () => Promise.resolve([]),
    delete: vi.fn(),
  },
  savedFoodsAPI: {
    list: () => savedList(),
    create: (d: unknown) => savedCreate(d),
    delete: (id: number) => savedDelete(id),
  },
}))

vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({
    settings: { calorie_target: 2000, protein_target: 150, carb_target: 250, fat_target: 70, weight_unit: 'lbs' },
    fetch: () => Promise.resolve(),
  }),
}))

// Three servings of Oats logged: 900 kcal on the diary, 300 kcal as a favourite.
const OATS = {
  id: 7, user_id: 1, name: 'Oats', brand: 'Quaker', meal: 'breakfast',
  calories: 900, protein: 30, carbs: 150, fat: 15, fiber: 9,
  servings: 3, serving_size: '40 g', logged_at: '2026-09-18T08:00:00Z', logged_on: '2026-09-18',
}
const SAVED_OATS = {
  id: 42, user_id: 1, name: 'Oats', brand: 'Quaker',
  calories: 300, protein: 10, carbs: 50, fat: 5, fiber: 3, serving_size: '40 g', barcode: '', created_at: '',
}

const renderPage = () => render(<MemoryRouter><Food /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  list.mockResolvedValue([OATS])
})

describe('Starring from the diary', () => {
  it('adds the entry to Favorites as one serving of the food', async () => {
    savedList.mockResolvedValue([])
    savedCreate.mockResolvedValue(SAVED_OATS)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Add Oats to Favorites' }))

    await waitFor(() => expect(savedCreate).toHaveBeenCalledTimes(1))
    expect(savedCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Oats', brand: 'Quaker', calories: 300, protein: 10, carbs: 50, fat: 5, fiber: 3,
    }))
    expect(await screen.findByRole('button', { name: 'Remove Oats from Favorites' })).toBeTruthy()
  })

  it('removes an entry that is already a favourite', async () => {
    savedList.mockResolvedValue([SAVED_OATS])
    savedDelete.mockResolvedValue(undefined)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Oats from Favorites' }))

    await waitFor(() => expect(savedDelete).toHaveBeenCalledWith(42))
    expect(await screen.findByRole('button', { name: 'Add Oats to Favorites' })).toBeTruthy()
  })

  it('says why a star failed', async () => {
    savedList.mockResolvedValue([])
    savedCreate.mockRejectedValue(Object.assign(new Error('HTTP 503'), {
      response: { status: 503, data: { error: 'The server is busy. Try again.' } },
    }))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Add Oats to Favorites' }))

    expect(await screen.findByText('The server is busy. Try again.')).toBeTruthy()
  })

  // Unknown is not "not a favourite": if the list never arrived, an empty star would claim
  // something we don't know, so the slot shows the failure mark and nothing to press.
  it('shows the failure mark in place of the star when the favourites list failed to load', async () => {
    savedList.mockRejectedValue(new Error('down'))
    renderPage()

    expect(await screen.findByRole('img', { name: "Couldn't load your favourites" })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Favorites/ })).toBeNull()
  })
})

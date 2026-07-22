import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProgramPicker from './ProgramPicker'
import * as types from '../types'

const listMock = vi.fn()
vi.mock('../services/api', () => ({
  programAPI: { list: () => listMock() },
}))

const day = (overrides: Partial<types.ProgramDay> = {}): types.ProgramDay => ({
  id: 1,
  order_index: 0,
  is_rest_day: false,
  name: '',
  exercises: [],
  ...overrides,
})

const program = (days: types.ProgramDay[], overrides: Partial<types.Program> = {}): types.Program => ({
  id: 1,
  name: 'PPL',
  created_at: '2026-01-01T00:00:00Z',
  days,
  current_day_index: 0,
  ...overrides,
})

// [Push, Rest, unnamed] — current_day_index 2 points at the unnamed day.
const multiDay = () =>
  program(
    [
      day({ id: 1, order_index: 0, name: 'Push' }),
      day({ id: 2, order_index: 1, is_rest_day: true }),
      day({ id: 3, order_index: 2 }),
    ],
    { current_day_index: 2 }
  )

describe('ProgramPicker', () => {
  beforeEach(() => listMock.mockReset())

  it('a program with zero workout days renders disabled (nothing to load)', async () => {
    listMock.mockResolvedValue([program([day({ is_rest_day: true })])])
    render(<ProgramPicker onSelect={() => {}} onClose={() => {}} />)
    const btn = (await screen.findByText('PPL')).closest('button')!
    expect(btn.disabled).toBe(true)
    expect(screen.getByText('No exercises yet')).toBeTruthy()
  })

  it('a single-workout-day program selects immediately (one-tap flow preserved)', async () => {
    const only = day({ id: 5, order_index: 1 })
    const p = program([day({ id: 4, order_index: 0, is_rest_day: true }), only])
    listMock.mockResolvedValue([p])
    const onSelect = vi.fn()
    render(<ProgramPicker onSelect={onSelect} onClose={() => {}} />)
    fireEvent.click(await screen.findByText('PPL'))
    expect(onSelect).toHaveBeenCalledWith(p, only)
  })

  it('a multi-workout-day program opens the day step listing only workout days, labeled by cycle position', async () => {
    listMock.mockResolvedValue([multiDay()])
    render(<ProgramPicker onSelect={() => {}} onClose={() => {}} />)
    fireEvent.click(await screen.findByText('PPL'))
    expect(screen.getByText('Pick a day to pre-fill exercises')).toBeTruthy()
    expect(screen.getByText('Push')).toBeTruthy()
    // The unnamed day sits at cycle position 2 → "Day 3", NOT "Day 2" (the
    // rest-filtered loop index) — regression guard for the dayLabel(day, i) bug.
    expect(screen.getByText('Day 3')).toBeTruthy()
    expect(screen.queryByText('Rest Day')).toBeNull()
  })

  it('marks the due day with a TODAY chip in the day step', async () => {
    listMock.mockResolvedValue([multiDay()])
    render(<ProgramPicker onSelect={() => {}} onClose={() => {}} />)
    fireEvent.click(await screen.findByText('PPL'))
    const today = screen.getByText('TODAY')
    // The chip sits inside the due day's row (the unnamed "Day 3"), not Push's.
    expect(today.closest('button')!.textContent).toContain('Day 3')
  })

  it('picking a day fires onSelect with the program and that day', async () => {
    const p = multiDay()
    listMock.mockResolvedValue([p])
    const onSelect = vi.fn()
    render(<ProgramPicker onSelect={onSelect} onClose={() => {}} />)
    fireEvent.click(await screen.findByText('PPL'))
    fireEvent.click(screen.getByText('Push'))
    expect(onSelect).toHaveBeenCalledWith(p, p.days[0])
  })

  it('back returns from the day step to the program list', async () => {
    listMock.mockResolvedValue([multiDay()])
    render(<ProgramPicker onSelect={() => {}} onClose={() => {}} />)
    fireEvent.click(await screen.findByText('PPL'))
    fireEvent.click(screen.getByText('← Back to programs'))
    expect(screen.getByText('Load from Program')).toBeTruthy()
    expect(screen.queryByText('Pick a day to pre-fill exercises')).toBeNull()
  })
})

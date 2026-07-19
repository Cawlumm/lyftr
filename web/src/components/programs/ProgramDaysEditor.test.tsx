import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProgramDaysEditor from './ProgramDaysEditor'
import type { DayDraft } from './types'

const dayDraft = (overrides: Partial<DayDraft> = {}): DayDraft => ({
  order_index: 0,
  is_rest_day: false,
  name: '',
  exercises: [],
  ...overrides,
})

const renderEditor = (days: DayDraft[], onChange = vi.fn()) => {
  render(
    <ProgramDaysEditor
      days={days}
      onChange={onChange}
      pickerExercises={{}}
      onCacheExercise={() => {}}
      wUnit="lbs"
      restSecondsDefault={90}
    />
  )
  return onChange
}

describe('ProgramDaysEditor', () => {
  it('renders the empty state when there are no days', () => {
    renderEditor([])
    expect(screen.getByText(/No days yet/)).toBeTruthy()
  })

  it('Add Workout Day appends a workout day with a reindexed order_index', () => {
    const onChange = renderEditor([dayDraft({ name: 'Push' })])
    fireEvent.click(screen.getByText('Add Workout Day'))
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ order_index: 1, is_rest_day: false, exercises: [] })
  })

  it('Add Rest Day appends a rest day', () => {
    const onChange = renderEditor([])
    fireEvent.click(screen.getByText('Add Rest Day'))
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next).toEqual([dayDraft({ is_rest_day: true })])
  })

  it('removing a day reindexes the survivors', () => {
    const onChange = renderEditor([
      dayDraft({ order_index: 0, name: 'A' }),
      dayDraft({ order_index: 1, name: 'B' }),
      dayDraft({ order_index: 2, name: 'C' }),
    ])
    // One trash button per day row (set rows would add more, but days are empty).
    const trash = document.querySelectorAll('button svg.lucide-trash-2')
    fireEvent.click(trash[1].closest('button')!)
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next.map(d => d.name)).toEqual(['A', 'C'])
    expect(next.map(d => d.order_index)).toEqual([0, 1])
  })

  it('move-down swaps a day with its neighbor and rewrites order_index', () => {
    const onChange = renderEditor([
      dayDraft({ order_index: 0, name: 'A' }),
      dayDraft({ order_index: 1, name: 'B' }),
    ])
    const downs = document.querySelectorAll('button svg.lucide-chevron-down')
    fireEvent.click(downs[0].closest('button')!)
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next.map(d => d.name)).toEqual(['B', 'A'])
    expect(next.map(d => d.order_index)).toEqual([0, 1])
  })

  it('toggling a workout day to rest CLEARS its exercises (a rest day never carries any)', () => {
    const exercises = [{ exercise_id: 1, notes: '', rest_seconds: 90, sets: [] }]
    const onChange = renderEditor([dayDraft({ exercises })])
    fireEvent.click(screen.getByText('Rest'))
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next[0].is_rest_day).toBe(true)
    expect(next[0].exercises).toEqual([])
  })

  it('toggling rest → workout keeps the (empty) exercise list and flips the flag', () => {
    const onChange = renderEditor([dayDraft({ is_rest_day: true })])
    fireEvent.click(screen.getByText('Workout'))
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next[0].is_rest_day).toBe(false)
  })

  it('renaming a day emits the patch without touching siblings', () => {
    const onChange = renderEditor([dayDraft({ name: 'A' }), dayDraft({ order_index: 1, name: 'B' })])
    const inputs = screen.getAllByPlaceholderText(/^Day \d$/)
    fireEvent.change(inputs[0], { target: { value: 'Push' } })
    const next: DayDraft[] = onChange.mock.calls[0][0]
    expect(next[0].name).toBe('Push')
    expect(next[1].name).toBe('B')
  })
})

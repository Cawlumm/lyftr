import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DayExercisesEditor from './DayExercisesEditor'
import * as types from '../../types'
import type { DayExerciseDraft } from './types'

const bench: types.Exercise = {
  id: 1, name: 'Bench Press', muscle_group: 'chest', secondary_muscles: [],
  category: 'strength', equipment: 'barbell', description: '',
}

const draft = (overrides: Partial<DayExerciseDraft> = {}): DayExerciseDraft => ({
  exercise_id: 1,
  notes: '',
  rest_seconds: 90,
  sets: [{ set_number: 1, target_reps: 5, target_weight: 135 }],
  ...overrides,
})

const renderEditor = (exercises: DayExerciseDraft[], onChange = vi.fn()) => {
  render(
    <DayExercisesEditor
      exercises={exercises}
      onChange={onChange}
      pickerExercises={{ 1: bench }}
      onCacheExercise={() => {}}
      wUnit="lbs"
      restSecondsDefault={90}
    />
  )
  return onChange
}

describe('DayExercisesEditor', () => {
  it('renders the empty state when the day has no exercises', () => {
    renderEditor([])
    expect(screen.getByText(/No exercises yet/)).toBeTruthy()
  })

  it('shows the cached exercise name and its set count', () => {
    renderEditor([draft()])
    expect(screen.getByText('Bench Press')).toBeTruthy()
    expect(screen.getByText('1 sets')).toBeTruthy()
  })

  it('Add Set appends a set with the next set_number', () => {
    const onChange = renderEditor([draft()])
    fireEvent.click(screen.getByText('Add Set'))
    const next: DayExerciseDraft[] = onChange.mock.calls[0][0]
    expect(next[0].sets).toHaveLength(2)
    expect(next[0].sets[1]).toEqual({ set_number: 2, target_reps: 0, target_weight: 0 })
  })

  it('editing target reps coerces to a number (garbage → 0)', () => {
    const onChange = renderEditor([draft()])
    fireEvent.change(screen.getByPlaceholderText('10'), { target: { value: '8' } })
    expect(onChange.mock.calls[0][0][0].sets[0].target_reps).toBe(8)
  })

  it('removing the exercise emits an empty list', () => {
    const onChange = renderEditor([draft()])
    // First trash button is the exercise's remove; the set rows' trash follow it.
    const trash = document.querySelectorAll('button svg.lucide-trash-2')
    fireEvent.click(trash[0].closest('button')!)
    expect(onChange.mock.calls[0][0]).toEqual([])
  })

  it('removing a set only touches that set', () => {
    const onChange = renderEditor([draft({
      sets: [
        { set_number: 1, target_reps: 5, target_weight: 135 },
        { set_number: 2, target_reps: 5, target_weight: 145 },
      ],
    })])
    const trash = document.querySelectorAll('button svg.lucide-trash-2')
    fireEvent.click(trash[1].closest('button')!) // first SET row (index 0 is the exercise remove)
    const next: DayExerciseDraft[] = onChange.mock.calls[0][0]
    expect(next[0].sets).toHaveLength(1)
    expect(next[0].sets[0].target_weight).toBe(145)
  })

  it('notes edits patch only the exercise notes', () => {
    const onChange = renderEditor([draft()])
    fireEvent.change(screen.getByPlaceholderText(/Focus on controlled/), { target: { value: 'pause reps' } })
    expect(onChange.mock.calls[0][0][0].notes).toBe('pause reps')
  })
})

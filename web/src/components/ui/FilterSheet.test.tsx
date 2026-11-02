import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterSheet from './FilterSheet'
import FilterButton from './FilterButton'
import ActiveFilters from './ActiveFilters'
import type { FilterGroup } from '@lyftr/shared'

// Deliberately not the exercise filters: the sheet is generic over whatever groups a screen
// declares, and a test that only used muscles would not notice if it quietly were not.
const groups: FilterGroup[] = [
  { key: 'meal', label: 'Meal', options: [{ value: 'lunch', label: 'Lunch' }, { value: 'dinner', label: 'Dinner' }] },
  { key: 'source', label: 'Source', options: [{ value: 'saved', label: 'Saved' }] },
]

const renderSheet = (values = { meal: null, source: null } as Record<string, string | null>) => {
  const onChange = vi.fn()
  const onReset = vi.fn()
  const onClose = vi.fn()
  render(<FilterSheet open groups={groups} values={values} onChange={onChange} onReset={onReset} onClose={onClose} />)
  return { onChange, onReset, onClose }
}

describe('FilterSheet', () => {
  it('renders a section per group with every option, and nothing when closed', () => {
    renderSheet()
    expect(screen.getByRole('group', { name: 'Meal' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Source' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dinner' })).toBeTruthy()
  })

  it('renders nothing when closed', () => {
    render(<FilterSheet open={false} groups={groups} values={{}} onChange={() => {}} onReset={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reports the option picked, and null when the one that is on is picked again', () => {
    const { onChange } = renderSheet({ meal: 'lunch', source: null })
    fireEvent.click(screen.getByRole('button', { name: 'Dinner' }))
    expect(onChange).toHaveBeenLastCalledWith('meal', 'dinner')
    fireEvent.click(screen.getByRole('button', { name: 'Lunch' }))
    expect(onChange).toHaveBeenLastCalledWith('meal', null)
  })

  it('disables Reset until something is on, then reports it', () => {
    const none = renderSheet()
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(true)
    expect(none.onReset).not.toHaveBeenCalled()
  })

  it('resets and closes', () => {
    const { onReset, onClose } = renderSheet({ meal: 'lunch', source: null })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onReset).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes from the close button', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  // Touch only: the grabber and header are the handle, so a swipe down past the threshold closes.
  const swipe = (to: number) => {
    const handle = screen.getByText('Filters').parentElement!.parentElement!
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(handle, { touches: [{ clientY: to }] })
    fireEvent.touchEnd(handle)
  }

  it('closes on a long swipe down and stays open on a short one', () => {
    const { onClose } = renderSheet()
    swipe(130)
    expect(onClose).not.toHaveBeenCalled()
    swipe(260)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const { onClose } = renderSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('FilterButton', () => {
  it('is plain at zero and carries the count above it', () => {
    const { rerender } = render(<FilterButton active={0} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
    rerender(<FilterButton active={2} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Filters, 2 active' }).textContent).toBe('2')
  })
})

describe('ActiveFilters', () => {
  it('lists what is on in group order and removes by key', () => {
    const onRemove = vi.fn()
    render(<ActiveFilters groups={groups} values={{ source: 'saved', meal: 'dinner' }} onRemove={onRemove} />)
    const chips = screen.getAllByRole('button')
    expect(chips.map(c => c.textContent)).toEqual(['Dinner', 'Saved'])
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Saved' }))
    expect(onRemove).toHaveBeenCalledWith('source')
  })

  it('renders nothing when nothing is on', () => {
    const { container } = render(<ActiveFilters groups={groups} values={{ meal: null, source: null }} onRemove={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})

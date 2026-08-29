import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorState from './ErrorState'
import ListError from './ListError'

// The component this whole slice exists to provide, and until now nothing rendered it in
// a test. Empty and error are different outcomes — empty means we heard back and there is
// nothing, error means we did not hear back at all — so the thing worth pinning is that
// this says which one it is, and offers a way out.
describe('ErrorState', () => {
  it('names what failed and why', () => {
    render(<ErrorState title="Couldn't load your dashboard" message="The server didn't respond in time." />)
    expect(screen.getByText("Couldn't load your dashboard")).toBeTruthy()
    expect(screen.getByText("The server didn't respond in time.")).toBeTruthy()
  })

  it('is announced as an alert, not read as ordinary prose', () => {
    render(<ErrorState title="Couldn't load" message="No answer." />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('offers a retry that actually calls back', () => {
    const onRetry = vi.fn()
    render(<ErrorState title="Couldn't load" message="No answer." onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows no retry when there is nothing to retry', () => {
    render(<ErrorState title="Couldn't load" message="No answer." />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('takes one escape hatch alongside the retry', () => {
    render(
      <ErrorState title="Couldn't load" message="No answer."
        onRetry={() => {}} secondary={<button>Back to workouts</button>} />,
    )
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /back to workouts/i })).toBeTruthy()
  })
})

describe('ListError', () => {
  // A failed list is section-scoped: the search box and the create button above it still
  // work, so the state replaces the rows and says which rows they were.
  it('names the subject that failed to load', () => {
    render(<ListError subject="workouts" message="The server didn't respond." onRetry={() => {}} />)
    expect(screen.getByText("Couldn't load workouts")).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})

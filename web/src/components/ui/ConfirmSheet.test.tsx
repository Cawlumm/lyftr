import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmSheet from './ConfirmSheet'

const props = {
  open: true,
  title: 'Delete Program?',
  message: '"PPL" will be permanently deleted.',
  confirmLabel: 'Delete',
  destructive: true,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

// The sheet is the only place a failed confirmation has to report itself: the row it came
// from is still on screen unchanged, so a sheet that dismisses on failure says nothing at
// all. Everything below is about it staying put long enough to do that.
describe('ConfirmSheet', () => {
  it('says what is about to happen and offers both ways out', () => {
    render(<ConfirmSheet {...props} />)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('"PPL" will be permanently deleted.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('shows why the last confirm failed, without dismissing', () => {
    render(<ConfirmSheet {...props} error="The server is restarting or unreachable." />)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('restarting or unreachable')
  })

  // Both dismissals were live while `busy`. Escape or Cancel mid-delete closed the sheet,
  // the request carried on, and the 502 landed with nowhere to be shown — the exact
  // silent failure this component was written to end. Driven in a browser against a
  // black-holed DELETE before being pinned here.
  it('refuses Cancel while the confirmed action is in flight', () => {
    const onCancel = vi.fn()
    render(<ConfirmSheet {...props} busy onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('refuses Escape while the confirmed action is in flight', () => {
    const onCancel = vi.fn()
    render(<ConfirmSheet {...props} busy onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('refuses a second confirm while the first is in flight', () => {
    const onConfirm = vi.fn()
    render(<ConfirmSheet {...props} busy busyLabel="Deleting…" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Deleting…' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // The counterweight to the three above: refusing dismissal only while in flight, never
  // after. A sheet that stayed locked once the request settled would be a trap.
  it('lets go again once the action has settled', () => {
    const onCancel = vi.fn()
    render(<ConfirmSheet {...props} error="The server is restarting or unreachable." onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('renders nothing when closed', () => {
    const { container } = render(<ConfirmSheet {...props} open={false} />)
    expect(container.textContent).toBe('')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

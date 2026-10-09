import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ChangeEmail from './ChangeEmail'

const changeEmail = vi.fn()

const state = () => ({
  user: { id: 1, email: 'carter@example.com', created_at: '2026-07-01T00:00:00Z' },
  changeEmail,
})

vi.mock('../stores/auth', () => ({
  useAuthStore: (selector?: (s: unknown) => unknown) => (selector ? selector(state()) : state()),
}))

const renderPage = () =>
  render(
    <MemoryRouter>
      <ChangeEmail />
    </MemoryRouter>,
  )

const submitButton = () => screen.getByRole('button', { name: 'Update email' }) as HTMLButtonElement
const typeEmail = (v: string) => fireEvent.change(screen.getByLabelText('New email'), { target: { value: v } })
const typePassword = (v: string) => fireEvent.change(screen.getByLabelText('Current password'), { target: { value: v } })

describe('ChangeEmail', () => {
  beforeEach(() => {
    changeEmail.mockReset()
  })

  it('shows the current address', () => {
    renderPage()
    expect(screen.getByText('carter@example.com')).toBeTruthy()
  })

  it('enables the button only for a different address and a password', () => {
    renderPage()
    expect(submitButton().disabled).toBe(true)

    typeEmail('carter@example.com')
    typePassword('password123')
    expect(submitButton().disabled).toBe(true)

    typeEmail('new@example.com')
    expect(submitButton().disabled).toBe(false)
  })

  it('submits the typed values and confirms with the address the server returned', async () => {
    changeEmail.mockResolvedValue({ id: 1, email: 'new@example.com', created_at: '2026-07-01T00:00:00Z' })
    renderPage()

    typeEmail('new@example.com')
    typePassword('password123')
    fireEvent.click(submitButton())

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Email changed' })).toBeTruthy())
    expect(changeEmail).toHaveBeenCalledWith('new@example.com', 'password123')
    expect(screen.getByText('new@example.com')).toBeTruthy()
    expect(screen.getByText(/Sign in with.*from now on/s).textContent).toContain('new@example.com')
    expect(screen.getByText(/other devices are signed out/s)).toBeTruthy()
  })

  it('says the other devices stay signed in when only the letter case changed', async () => {
    changeEmail.mockResolvedValue({ id: 1, email: 'Carter@example.com', created_at: '2026-07-01T00:00:00Z' })
    renderPage()

    typeEmail('Carter@example.com')
    typePassword('password123')
    fireEvent.click(submitButton())

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Email changed' })).toBeTruthy())
    expect(screen.getByText(/Only the letter case changed/).textContent).toContain('other devices stay signed in')
    expect(screen.queryByText(/other devices are signed out/)).toBeNull()
  })

  it('shows a refusal in the form and keeps what was typed', async () => {
    changeEmail.mockRejectedValue({
      response: { status: 409, data: { error: 'That email is already registered.' } },
    })
    renderPage()

    typeEmail('taken@example.com')
    typePassword('password123')
    fireEvent.click(submitButton())

    await waitFor(() => expect(screen.getByText('That email is already registered.')).toBeTruthy())
    expect((screen.getByLabelText('New email') as HTMLInputElement).value).toBe('taken@example.com')
  })
})

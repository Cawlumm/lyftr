import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Register from './Register'
import { i18n } from '@lyftr/shared'
import es from '../../../packages/shared/src/i18n/locales/es.json'

const register = vi.fn()

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ register }),
}))
vi.mock('../hooks/useServerInfo', () => ({ useServerInfo: () => ({ name: 'Lyftr', version: '1', registration_open: true }) }))
vi.mock('../components/ServerSettings', () => ({ default: () => null }))

const submit = (container: HTMLElement) => {
  fireEvent.change(container.querySelector('#email')!, { target: { value: 'a@b.co' } })
  fireEvent.change(container.querySelector('#password')!, { target: { value: 'password123' } })
  fireEvent.change(container.querySelector('#password-confirm')!, { target: { value: 'password123' } })
  fireEvent.submit(container.querySelector('form')!)
}

const renderPage = () => render(<MemoryRouter><Register /></MemoryRouter>)

describe('Register server errors', () => {
  beforeEach(() => { register.mockReset() })
  afterEach(async () => { await i18n.changeLanguage('en') })

  it('es: EMAIL_TAKEN shows Spanish', async () => {
    await i18n.changeLanguage('es')
    register.mockRejectedValue({
      response: { status: 409, data: { error: 'That email is already registered.', code: 'EMAIL_TAKEN' } },
    })
    const { container } = renderPage()
    submit(container)

    await waitFor(() => expect(container.querySelector('.alert-error')?.textContent).toBe(es.errors.api.codes.EMAIL_TAKEN))
  })

  it('a response without a code shows the server sentence', async () => {
    register.mockRejectedValue({
      response: { status: 409, data: { error: 'That email is already registered.' } },
    })
    const { container } = renderPage()
    submit(container)

    await waitFor(() => expect(container.querySelector('.alert-error')?.textContent).toBe('That email is already registered.'))
  })
})

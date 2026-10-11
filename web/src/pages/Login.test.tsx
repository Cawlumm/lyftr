import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'
import { i18n } from '@lyftr/shared'
import es from '../../../packages/shared/src/i18n/locales/es.json'

const login = vi.fn()

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ login }),
}))
vi.mock('../hooks/useServerInfo', () => ({ useServerInfo: () => null }))
vi.mock('../components/ServerSettings', () => ({ default: () => null }))

const submit = (container: HTMLElement) => {
  fireEvent.change(container.querySelector('#email')!, { target: { value: 'a@b.co' } })
  fireEvent.change(container.querySelector('#password')!, { target: { value: 'wrongpassword' } })
  fireEvent.submit(container.querySelector('form')!)
}

describe('Login server errors', () => {
  beforeEach(() => { login.mockReset() })
  afterEach(async () => { await i18n.changeLanguage('en') })

  it('es: INVALID_CREDENTIALS shows Spanish and follows a switch back to English', async () => {
    await i18n.changeLanguage('es')
    login.mockRejectedValue({
      response: { status: 401, data: { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' } },
    })
    const { container } = render(<MemoryRouter><Login /></MemoryRouter>)
    submit(container)

    await waitFor(() => expect(container.querySelector('.alert-error')?.textContent).toBe(es.errors.api.codes.INVALID_CREDENTIALS))
    await act(async () => { await i18n.changeLanguage('en') })
    expect(container.querySelector('.alert-error')?.textContent).toBe('Invalid email or password.')
  })
})

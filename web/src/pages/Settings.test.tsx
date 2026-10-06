import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Settings from './Settings'

// What these pin is the shape of the WRITES this page makes, which is where #170 went
// wrong twice. The name began life inside `formData`, and the only button that commits
// `formData` is labelled "Save targets", sits in another section, and disappears
// entirely when the settings read fails — so the field could not be saved on purpose and
// could be saved by accident, because the weight-unit toggle sent the whole form.
//
// Hence: every assertion below is about which keys reach `update`.

const update = vi.fn()
const fetchSettings = vi.fn()

let state: Record<string, unknown>

const makeState = (over: Record<string, unknown> = {}) => ({
  settings: {
    user_id: 1,
    weight_unit: 'lbs',
    calorie_target: 2000,
    protein_target: 150,
    carb_target: 250,
    fat_target: 65,
    timezone: 'UTC',
    display_name: '',
    workout_layout: 'list',
    rest_enabled: true,
    rest_seconds_default: 90,
  },
  loaded: true,
  loadFailed: false,
  update,
  fetch: fetchSettings,
  setWorkoutLayout: vi.fn(),
  setRestEnabled: vi.fn(),
  setRestSeconds: vi.fn(),
  ...over,
})

vi.mock('../stores/settings', () => ({
  useSettingsStore: Object.assign(
    (selector?: (s: unknown) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  ),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 1, email: 'carter@example.com', created_at: '2026-07-01T00:00:00Z' },
    logout: vi.fn(),
  }),
}))

vi.mock('../stores/server', () => ({ useServerStore: () => '' }))
vi.mock('../hooks/useServerInfo', () => ({ useServerInfo: () => null }))
vi.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }) }))
vi.mock('../components/ServerSettings', () => ({ default: () => null }))
vi.mock('../services/api', () => ({
  exerciseAPI: {
    cacheStatus: vi.fn().mockResolvedValue({ count: 0 }),
    refreshCache: vi.fn(),
    clearCacheOnServer: vi.fn(),
  },
  userAPI: { deleteAccount: vi.fn() },
}))

const renderPage = () => render(<MemoryRouter><Settings /></MemoryRouter>)
const nameField = () => screen.getByLabelText('Name')

beforeEach(() => {
  vi.clearAllMocks()
  state = makeState()
  update.mockResolvedValue(undefined)
})

describe('the Name row', () => {
  it('offers no Save until the name actually changes', async () => {
    renderPage()
    await waitFor(() => expect(nameField()).toBeTruthy())

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    fireEvent.change(nameField(), { target: { value: 'Carter' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  // The regression: it must send ONLY its own field. Sending the whole form is how the
  // unit toggle used to commit a half-typed name.
  it('sends only display_name, trimmed', async () => {
    renderPage()
    await waitFor(() => expect(nameField()).toBeTruthy())

    fireEvent.change(nameField(), { target: { value: '  Carter  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith({ display_name: 'Carter' })
  })

  // The other half of the same bug, from the other direction.
  it('does not carry a half-typed name when the weight unit is changed', async () => {
    renderPage()
    await waitFor(() => expect(nameField()).toBeTruthy())

    fireEvent.change(nameField(), { target: { value: 'Half' } })
    fireEvent.click(screen.getByRole('button', { name: 'kg' }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith({ weight_unit: 'kg' })
  })

  // `loadFailed` means the settings on screen are substitutes, not the user's. Offering
  // to write a name over one we failed to read is the silent-default-substitution shape
  // the rest of this page was hardened against.
  it('will not offer to overwrite a name it could not read', async () => {
    state = makeState({ loadFailed: true })
    renderPage()

    await waitFor(() => expect(screen.getByText(/Couldn't load your name/)).toBeTruthy())
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  // The in-flight "Saving…" state is deliberately NOT tested here. It only appears
  // because the real store applies its patch optimistically before awaiting, which makes
  // the row stop being dirty mid-write — and this file's store is a plain stub that never
  // re-renders, so any assertion about it passes whether the fix is present or not. It is
  // verified against the real store in a browser with the response delayed instead.
  it('names the field and its help text for a screen reader', async () => {
    renderPage()
    await waitFor(() => expect(nameField()).toBeTruthy())

    const described = nameField().getAttribute('aria-describedby')
    expect(described).toBeTruthy()
    expect(document.getElementById(described!)?.textContent).toMatch(/use your email/)
  })
})

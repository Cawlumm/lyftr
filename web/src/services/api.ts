import axios, { AxiosInstance } from 'axios'
import * as types from '../types'
import { normalizeServerUrl } from '../stores/server'

// Every API call lives under this versioned path. `origin` is an absolute server
// origin for a cross-origin backend, or '' for the same-origin reverse proxy.
const API_BASE_PATH = '/api/v1'
export const apiUrl = (origin = '') => `${origin}${API_BASE_PATH}`

// Resolved per-request so the "Server settings" panel takes effect immediately,
// without needing a full page reload.
const resolveAPIBase = () => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined
  if (envUrl) return envUrl
  // Re-normalize in case localStorage holds a legacy/scheme-less value: a relative
  // base would make axios fold the host into the request path (bogus 405s), so fall
  // back to the same-origin reverse proxy when it can't be made absolute.
  const stored = localStorage.getItem('server_url')
  const base = stored ? normalizeServerUrl(stored) : ''
  return apiUrl(base)
}

// Turn an axios error into an actionable message. Network/CORS/connection failures
// (no response) and proxy misconfig (404/405) are distinguished from real auth and
// server errors, so connectivity problems don't masquerade as "Registration failed."
// Intended for the auth/connectivity flows (login/register/connection test); the
// 404/405 wording assumes a misconfigured server URL rather than a missing resource.
export const apiErrorMessage = (err: any, fallback: string): string => {
  if (err?.response) {
    const serverError = err.response.data?.error
    if (serverError) return serverError
    const status = err.response.status
    if (status === 404 || status === 405) {
      return "Server URL looks misconfigured — the API endpoint wasn't found. Check Server settings."
    }
    if (status >= 500) return 'Server error. Please try again shortly.'
    return fallback
  }
  return "Can't reach the server. Check the URL, that the backend is running, and that it allows this app's origin (CORS)."
}

export interface ServerInfo {
  name: string
  version: string
}

// Probes a server's public /info endpoint to confirm it's reachable and is a
// Lyftr backend. Pass '' to test the same-origin reverse-proxy path. Runs under
// the backend's CORS policy, so success predicts that real requests will work.
export const testServerConnection = async (
  base: string,
): Promise<{ ok: true; info: ServerInfo } | { ok: false; message: string }> => {
  try {
    const res = await axios.get<{ data: ServerInfo }>(`${apiUrl(base)}/info`, { timeout: 8000 })
    const info = res.data?.data
    if (!info?.name) {
      return { ok: false, message: "That responded, but it doesn't look like a Lyftr server." }
    }
    return { ok: true, info }
  } catch (err) {
    return { ok: false, message: apiErrorMessage(err, "Couldn't reach the server.") }
  }
}

const api: AxiosInstance = axios.create({
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  config.baseURL = resolveAPIBase()
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    // A 401 from the auth endpoints themselves is a credential error, not an
    // expired session — let the page show it instead of attempting a token
    // refresh and redirecting (which would wipe "Invalid email or password").
    const isAuthRequest = (original?.url || '').includes('/auth/')
    if (error.response?.status === 401 && !original._retry && !isAuthRequest) {
      original._retry = true
      try {
        const refreshToken = localStorage.getItem('refresh_token')
        const res = await axios.post(`${resolveAPIBase()}/auth/refresh`, { refresh_token: refreshToken })
        const newToken = res.data.data.token
        localStorage.setItem('access_token', newToken)
        original.headers.Authorization = `Bearer ${newToken}`
        if (res.data.data.refresh_token) {
          localStorage.setItem('refresh_token', res.data.data.refresh_token)
        }
        return api(original)
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

const unwrap = <T>(res: { data: { data: T } }) => res.data.data

export const authAPI = {
  login:    (data: types.LoginRequest)    => api.post<{ data: types.AuthResponse }>('/auth/login', data).then(res => unwrap(res)),
  register: (data: types.RegisterRequest) => api.post<{ data: types.AuthResponse }>('/auth/register', data).then(res => unwrap(res)),
}

export const userAPI = {
  me:             ()                             => api.get<{ data: types.User }>('/me').then(res => unwrap(res)),
  getSettings:    ()                             => api.get<{ data: types.UserSettings }>('/settings').then(res => unwrap(res)),
  updateSettings: (data: Partial<types.UserSettings>) => api.put<{ data: types.UserSettings }>('/settings', data).then(res => unwrap(res)),
  deleteAccount:  ()                             => api.delete('/me'),
}

export const workoutAPI = {
  list:   (params?: { limit?: number; offset?: number; q?: string }) =>
    api.get<{ data: types.Workout[] }>('/workouts', { params }).then(res => unwrap(res)),
  get:    (id: number) => api.get<{ data: types.Workout }>(`/workouts/${id}`).then(res => unwrap(res)),
  create: (data: any) => api.post<{ data: types.Workout }>('/workouts', data).then(res => unwrap(res)),
  update: (id: number, data: any) => api.put<{ data: types.Workout }>(`/workouts/${id}`, data).then(res => unwrap(res)),
  delete: (id: number) => api.delete(`/workouts/${id}`),
}

let _exerciseCache: types.Exercise[] | null = null
let _exerciseCachePromise: Promise<types.Exercise[]> | null = null

export const exerciseAPI = {
  list: (params?: { q?: string; muscle_group?: string; category?: string; equipment?: string }) => {
    if (params?.q || params?.muscle_group || params?.category || params?.equipment) {
      return api.get<{ data: types.Exercise[] }>('/exercises', { params }).then(res => unwrap(res))
    }
    if (_exerciseCache) return Promise.resolve(_exerciseCache)
    if (_exerciseCachePromise) return _exerciseCachePromise
    _exerciseCachePromise = api.get<{ data: types.Exercise[] }>('/exercises', { params: { limit: 1000 } })
      .then(res => {
        _exerciseCache = unwrap(res)
        _exerciseCachePromise = null
        return _exerciseCache
      })
    return _exerciseCachePromise
  },
  get: (id: number) => api.get<{ data: types.Exercise }>(`/exercises/${id}`).then(res => unwrap(res)),
  getPRs: (id: number) => api.get<{ data: types.PersonalRecord }>(`/exercises/${id}/prs`).then(res => unwrap(res)),
  getHistory: (id: number, limit = 20) => api.get<{ data: types.ExerciseHistoryPoint[] }>(`/exercises/${id}/history`, { params: { limit } }).then(res => unwrap(res)),
  clearCache: () => { _exerciseCache = null; _exerciseCachePromise = null },
  seedStatus: () => api.get<{ data: { count: number; in_progress: boolean } }>('/admin/seed-status').then(res => unwrap(res)),
  sync: () => api.post<{ data: { synced: boolean; total: number } }>('/admin/sync-exercises').then(res => unwrap(res)),
}


export const programAPI = {
  list:   (params?: { limit?: number; offset?: number; q?: string }) => api.get<{ data: types.Program[] }>('/programs', { params }).then(res => unwrap(res)),
  get:    (id: number) => api.get<{ data: types.Program }>(`/programs/${id}`).then(res => unwrap(res)),
  create: (data: any) => api.post<{ data: types.Program }>('/programs', data).then(res => unwrap(res)),
  update: (id: number, data: any) => api.put<{ data: types.Program }>(`/programs/${id}`, data).then(res => unwrap(res)),
  delete: (id: number) => api.delete(`/programs/${id}`),
  // Accept/dismiss staged auto-progression suggestions (#40); returns the updated program.
  resolveSuggestions: (id: number, data: { accept: number[]; dismiss: number[] }) =>
    api.post<{ data: types.Program }>(`/programs/${id}/suggestions/resolve`, data).then(res => unwrap(res)),
}

export const weightAPI = {
  list:   (params?: { limit?: number; offset?: number; from?: string; to?: string }) =>
    api.get<{ data: types.WeightLog[] }>('/weight', { params }).then(res => unwrap(res)),
  get:    (id: number) => api.get<{ data: types.WeightLog }>(`/weight/${id}`).then(res => unwrap(res)),
  log:    (data: { weight: number; notes?: string; logged_at?: string }) =>
    api.post<{ data: types.WeightLog }>('/weight', data).then(res => unwrap(res)),
  update: (id: number, data: { weight: number; notes?: string; logged_at?: string }) =>
    api.patch<{ data: types.WeightLog }>(`/weight/${id}`, data).then(res => unwrap(res)),
  delete: (id: number) => api.delete(`/weight/${id}`),
  stats:  () => api.get<{ data: types.WeightStats }>('/weight/stats').then(res => unwrap(res)),
}

export const foodAPI = {
  list:    (date?: string) => api.get<{ data: types.FoodLog[] }>('/food', { params: { date } }).then(res => unwrap(res)),
  log:     (data: any) => api.post<{ data: types.FoodLog }>('/food', data).then(res => unwrap(res)),
  get:     (id: number) => api.get<{ data: types.FoodLog }>(`/food/${id}`).then(res => unwrap(res)),
  update:  (id: number, data: any) => api.patch<{ data: types.FoodLog }>(`/food/${id}`, data).then(res => unwrap(res)),
  delete:  (id: number) => api.delete(`/food/${id}`),
  stats:   (date?: string) => api.get<{ data: types.DailyStats }>('/food/stats', { params: { date } }).then(res => unwrap(res)),
  history: (days = 30) => api.get<{ data: types.FoodHistoryPoint[] }>('/food/history', { params: { days } }).then(res => unwrap(res)),
  search:  (q: string, limit = 20) => api.get<{ data: types.FoodSearchResult[] }>('/food/search', { params: { q, limit } }).then(res => unwrap(res)),
  barcode: (code: string) => api.get<{ data: types.FoodSearchResult }>(`/food/barcode/${code}`).then(res => unwrap(res)),
}

export const savedFoodsAPI = {
  list:   () => api.get<{ data: types.SavedFood[] }>('/food/saved').then(res => unwrap(res)),
  create: (data: any) => api.post<{ data: types.SavedFood }>('/food/saved', data).then(res => unwrap(res)),
  delete: (id: number) => api.delete(`/food/saved/${id}`),
}

export default api

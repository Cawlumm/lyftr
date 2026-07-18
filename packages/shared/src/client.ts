import axios, { AxiosInstance } from 'axios'
import * as types from './types'
import { StorageAdapter, STORAGE_KEYS } from './storage'
import { normalizeServerUrl } from './utils/serverUrl'

// Every API call lives under this versioned path. `origin` is an absolute server
// origin for a cross-origin backend, or '' for the same-origin reverse proxy (web).
const API_BASE_PATH = '/api/v1'
export const apiUrl = (origin = '') => `${origin}${API_BASE_PATH}`

export interface ServerInfo {
  name: string
  version: string
}

export interface ClientOptions {
  // Called after a token refresh fails — the session is dead. Web passes a
  // `location.href = '/login'`; mobile passes `router.replace('/login')`.
  onAuthFailure?: () => void
  // Optional hard override of the base URL (web passes import.meta.env.VITE_API_URL).
  // When set, the stored server_url is ignored.
  baseUrlOverride?: string
}

// Turn an axios error into an actionable message. Network/CORS/connection failures
// (no response) and proxy misconfig (404/405) are distinguished from real auth and
// server errors, so connectivity problems don't masquerade as "Registration failed."
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

// Probe a server's public /info endpoint to confirm it's reachable and is a Lyftr
// backend. Pass '' for the default/reverse-proxy origin.
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

const unwrap = <T>(res: { data: { data: T } }) => res.data.data

// Build a fully-wired API client bound to a platform storage adapter. All token
// reads/writes and the base-URL resolution go through `storage`, so the same code
// runs on web (localStorage) and mobile (SecureStore/AsyncStorage).
export function createClient(storage: StorageAdapter, opts: ClientOptions = {}) {
  // Resolved per-request so a "Server settings" change takes effect immediately.
  const resolveAPIBase = async (): Promise<string> => {
    if (opts.baseUrlOverride) return opts.baseUrlOverride
    const stored = await storage.get(STORAGE_KEYS.serverUrl)
    const base = stored ? normalizeServerUrl(stored) : ''
    return apiUrl(base)
  }

  const api: AxiosInstance = axios.create({
    headers: { 'Content-Type': 'application/json' },
  })

  api.interceptors.request.use(async (config) => {
    config.baseURL = await resolveAPIBase()
    const token = await storage.get(STORAGE_KEYS.access)
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config
      // A 401 from the auth endpoints themselves is a credential error, not an
      // expired session — let the page show it instead of refreshing/redirecting.
      const isAuthRequest = (original?.url || '').includes('/auth/')
      if (error.response?.status === 401 && !original._retry && !isAuthRequest) {
        original._retry = true
        try {
          const refreshToken = await storage.get(STORAGE_KEYS.refresh)
          const base = await resolveAPIBase()
          const res = await axios.post(`${base}/auth/refresh`, { refresh_token: refreshToken })
          const newToken = res.data.data.token
          await storage.set(STORAGE_KEYS.access, newToken)
          original.headers.Authorization = `Bearer ${newToken}`
          if (res.data.data.refresh_token) {
            await storage.set(STORAGE_KEYS.refresh, res.data.data.refresh_token)
          }
          return api(original)
        } catch {
          await storage.remove(STORAGE_KEYS.access)
          await storage.remove(STORAGE_KEYS.refresh)
          await storage.remove(STORAGE_KEYS.user)
          opts.onAuthFailure?.()
        }
      }
      return Promise.reject(error)
    },
  )

  const authAPI = {
    login:    (data: types.LoginRequest)    => api.post<{ data: types.AuthResponse }>('/auth/login', data).then(unwrap),
    register: (data: types.RegisterRequest) => api.post<{ data: types.AuthResponse }>('/auth/register', data).then(unwrap),
  }

  const userAPI = {
    me:             () => api.get<{ data: types.User }>('/me').then(unwrap),
    getSettings:    () => api.get<{ data: types.UserSettings }>('/settings').then(unwrap),
    updateSettings: (data: Partial<types.UserSettings>) => api.put<{ data: types.UserSettings }>('/settings', data).then(unwrap),
    deleteAccount:  () => api.delete('/me'),
  }

  const workoutAPI = {
    list:   (params?: { limit?: number; offset?: number; q?: string }) =>
      api.get<{ data: types.Workout[] }>('/workouts', { params }).then(unwrap),
    get:    (id: number) => api.get<{ data: types.Workout }>(`/workouts/${id}`).then(unwrap),
    create: (data: any) => api.post<{ data: types.Workout }>('/workouts', data).then(unwrap),
    update: (id: number, data: any) => api.put<{ data: types.Workout }>(`/workouts/${id}`, data).then(unwrap),
    delete: (id: number) => api.delete(`/workouts/${id}`),
  }

  let exerciseCache: types.Exercise[] | null = null
  let exerciseCachePromise: Promise<types.Exercise[]> | null = null
  const exerciseAPI = {
    list: (params?: { q?: string; muscle_group?: string; category?: string; equipment?: string }) => {
      if (params?.q || params?.muscle_group || params?.category || params?.equipment) {
        return api.get<{ data: types.Exercise[] }>('/exercises', { params }).then(unwrap)
      }
      if (exerciseCache) return Promise.resolve(exerciseCache)
      if (exerciseCachePromise) return exerciseCachePromise
      exerciseCachePromise = api.get<{ data: types.Exercise[] }>('/exercises', { params: { limit: 1000 } })
        .then((res) => {
          exerciseCache = unwrap(res)
          exerciseCachePromise = null
          return exerciseCache
        })
      return exerciseCachePromise
    },
    get: (id: number) => api.get<{ data: types.Exercise }>(`/exercises/${id}`).then(unwrap),
    getPRs: (id: number) => api.get<{ data: types.PersonalRecord }>(`/exercises/${id}/prs`).then(unwrap),
    getHistory: (id: number, limit = 20) => api.get<{ data: types.ExerciseHistoryPoint[] }>(`/exercises/${id}/history`, { params: { limit } }).then(unwrap),
    clearCache: () => { exerciseCache = null; exerciseCachePromise = null },
  }

  const programAPI = {
    list:   (params?: { limit?: number; offset?: number; q?: string }) => api.get<{ data: types.Program[] }>('/programs', { params }).then(unwrap),
    get:    (id: number) => api.get<{ data: types.Program }>(`/programs/${id}`).then(unwrap),
    create: (data: any) => api.post<{ data: types.Program }>('/programs', data).then(unwrap),
    update: (id: number, data: any) => api.put<{ data: types.Program }>(`/programs/${id}`, data).then(unwrap),
    delete: (id: number) => api.delete(`/programs/${id}`),
    // Accept/dismiss staged auto-progression suggestions (#40); returns the updated program.
    resolveSuggestions: (id: number, data: { accept: number[]; dismiss: number[] }) =>
      api.post<{ data: types.Program }>(`/programs/${id}/suggestions/resolve`, data).then(unwrap),
  }

  const weightAPI = {
    list:   (params?: { limit?: number; offset?: number; from?: string; to?: string }) =>
      api.get<{ data: types.WeightLog[] }>('/weight', { params }).then(unwrap),
    get:    (id: number) => api.get<{ data: types.WeightLog }>(`/weight/${id}`).then(unwrap),
    log:    (data: { weight: number; notes?: string; logged_at?: string }) =>
      api.post<{ data: types.WeightLog }>('/weight', data).then(unwrap),
    update: (id: number, data: { weight: number; notes?: string; logged_at?: string }) =>
      api.patch<{ data: types.WeightLog }>(`/weight/${id}`, data).then(unwrap),
    delete: (id: number) => api.delete(`/weight/${id}`),
    stats:  () => api.get<{ data: types.WeightStats }>('/weight/stats').then(unwrap),
  }

  const foodAPI = {
    list:    (date?: string) => api.get<{ data: types.FoodLog[] }>('/food', { params: { date } }).then(unwrap),
    log:     (data: any) => api.post<{ data: types.FoodLog }>('/food', data).then(unwrap),
    get:     (id: number) => api.get<{ data: types.FoodLog }>(`/food/${id}`).then(unwrap),
    update:  (id: number, data: any) => api.patch<{ data: types.FoodLog }>(`/food/${id}`, data).then(unwrap),
    delete:  (id: number) => api.delete(`/food/${id}`),
    stats:   (date?: string) => api.get<{ data: types.DailyStats }>('/food/stats', { params: { date } }).then(unwrap),
    history: (days = 30) => api.get<{ data: types.FoodHistoryPoint[] }>('/food/history', { params: { days } }).then(unwrap),
    search:  (q: string, limit = 20) => api.get<{ data: types.FoodSearchResult[] }>('/food/search', { params: { q, limit } }).then(unwrap),
    barcode: (code: string) => api.get<{ data: types.FoodSearchResult }>(`/food/barcode/${code}`).then(unwrap),
  }

  const savedFoodsAPI = {
    list:   () => api.get<{ data: types.SavedFood[] }>('/food/saved').then(unwrap),
    create: (data: any) => api.post<{ data: types.SavedFood }>('/food/saved', data).then(unwrap),
    delete: (id: number) => api.delete(`/food/saved/${id}`),
  }

  return {
    api,
    authAPI,
    userAPI,
    workoutAPI,
    exerciseAPI,
    programAPI,
    weightAPI,
    foodAPI,
    savedFoodsAPI,
  }
}

export type LyftrClient = ReturnType<typeof createClient>

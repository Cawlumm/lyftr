import axios, { AxiosInstance } from 'axios'
import * as types from './types'
import { StorageAdapter, STORAGE_KEYS } from './storage'
import { normalizeServerUrl } from './utils/serverUrl'
import { networkFailureMessage } from './utils/networkError'
import { withLoggedOn, utcOffsetMinutes } from './utils/dateUtils'

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

// Turn an axios error into an actionable message. Proxy misconfig (404/405) is
// distinguished from real auth and server errors, so connectivity problems don't
// masquerade as "Registration failed." Response-less failures go to the classifier,
// which separates a blocked-cleartext or untrusted-certificate failure from a genuinely
// unreachable server — they are indistinguishable from the axios error alone.
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
  return networkFailureMessage(err)
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

  // Without an explicit timeout axios waits forever (default 0), so a silently dropped or
  // policy-blocked request hangs the UI instead of surfacing an error. A timeout is the
  // floor, not the whole answer — see BULK_TIMEOUT below for where one global value breaks.
  //
  // 20s rather than the 5s often quoted for web: the server here is someone's home box,
  // possibly a Pi waking a cold SQLite cache over wifi, and a false timeout is worse than a
  // slow response — it sends a self-hoster debugging a server that is actually fine, which
  // is the failure mode this whole change exists to stop. The /info probe in
  // testServerConnection stays at 8s because there the whole point is to fail fast.
  const api: AxiosInstance = axios.create({
    headers: { 'Content-Type': 'application/json' },
    timeout: 20000,
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
      api.get<{ data: types.Workout[] }>('/workouts', { params, ...listTimeout(params?.limit) }).then(unwrap),
    get:    (id: number) => api.get<{ data: types.Workout }>(`/workouts/${id}`).then(unwrap),
    // A workout keeps its instant and records the offset it happened at, rather than
    // flattening to a day like the diary does — duration and ordering need the moment.
    create: (data: any) =>
      api.post<{ data: types.Workout }>('/workouts', {
        ...data,
        tz_offset_minutes: utcOffsetMinutes(data?.started_at),
      }).then(unwrap),
    // The offset must describe the instant being sent, so it is stamped only when the
    // caller derived that instant here and now. Keyed on whether the caller mentioned the
    // field at all, not on its value: the mobile edit screen re-picks the date through
    // dayToInstant in this zone and omits the offset, so it gets this device's. A caller
    // that resends the timestamp it loaded names the field and is taken at its word —
    // including when the value is undefined because the row predates the column. Stamping
    // there would claim the workout happened where the editing happened; leaving it unset
    // lets the server fall back to the account zone, which is at least a stored answer
    // rather than wherever someone opened the form.
    update: (id: number, data: any) =>
      api.put<{ data: types.Workout }>(
        `/workouts/${id}`,
        'tz_offset_minutes' in (data ?? {})
          ? data
          : { ...data, tz_offset_minutes: utcOffsetMinutes(data?.started_at) },
      ).then(unwrap),
    delete: (id: number) => api.delete(`/workouts/${id}`),
  }

  // axios maps `timeout` to xhr.timeout, which bounds the WHOLE request, not just the
  // connect — so a large body on a slow link trips the global 20s even though nothing is
  // wrong. The seeded exercise list measures ~820 KB, which needs roughly 33s at 200 kbps;
  // every other endpoint returns a few KB. It's fetched once and cached below, so the
  // longer bound costs nothing and removes the one place the global value is too tight.
  const BULK_TIMEOUT = 60000

  // The exercise re-seed fetches and writes the entire upstream library. Web's client
  // had no timeout at all before this, so the button simply waited; 20s would turn a
  // working re-seed into a reported failure.
  const SYNC_TIMEOUT = 120000

  // A request that asks for many rows gets the bulk bound instead of the global 20s.
  // The dashboard pulls 84 workouts with their exercises and sets, and the weight page
  // pulls up to 1000 logs — both are megabyte-scale on a full account and neither is a
  // "something is wrong" case at 20s on a home server. Small paginated reads (the
  // default limit is 20) keep the tight bound, which is where a hang really does mean
  // a dropped request.
  const listTimeout = (limit?: number) => ((limit ?? 0) > 50 ? { timeout: BULK_TIMEOUT } : undefined)

  let exerciseCache: types.Exercise[] | null = null
  let exerciseCachePromise: Promise<types.Exercise[]> | null = null
  const exerciseAPI = {
    list: (params?: { q?: string; muscle_group?: string; category?: string; equipment?: string }) => {
      if (params?.q || params?.muscle_group || params?.category || params?.equipment) {
        return api.get<{ data: types.Exercise[] }>('/exercises', { params }).then(unwrap)
      }
      if (exerciseCache) return Promise.resolve(exerciseCache)
      if (exerciseCachePromise) return exerciseCachePromise
      // The in-flight promise is cleared on BOTH settle paths. Clearing it only in
      // .then() leaves a rejected promise cached for the life of the page: every later
      // call returns that same rejection, so one dropped request while the picker was
      // opening breaks the picker until a full reload. clearCache() would recover it
      // but nothing calls it. The rejection is re-thrown so the caller still sees the
      // failure — only the caching of it is undone.
      exerciseCachePromise = api.get<{ data: types.Exercise[] }>('/exercises', { params: { limit: 1000 }, timeout: BULK_TIMEOUT })
        .then((res) => {
          exerciseCache = unwrap(res)
          exerciseCachePromise = null
          return exerciseCache
        })
        .catch((err) => {
          exerciseCachePromise = null
          throw err
        })
      return exerciseCachePromise
    },
    get: (id: number) => api.get<{ data: types.Exercise }>(`/exercises/${id}`).then(unwrap),
    getPRs: (id: number) => api.get<{ data: types.PersonalRecord }>(`/exercises/${id}/prs`).then(unwrap),
    getHistory: (id: number, limit = 20) => api.get<{ data: types.ExerciseHistoryPoint[] }>(`/exercises/${id}/history`, { params: { limit } }).then(unwrap),
    clearCache: () => { exerciseCache = null; exerciseCachePromise = null },
    seedStatus: () => api.get<{ data: { count: number; in_progress: boolean } }>('/admin/seed-status').then(unwrap),
    // Re-seeds the whole exercise library from the upstream DB: hundreds of rows, and on
    // a cold or low-powered server it routinely runs past the global 20s. The button is an
    // explicit admin action the user waits on, so it gets its own bound — a timeout here
    // would report failure for work the server goes on to finish successfully.
    sync: () => api.post<{ data: { synced: boolean; total: number } }>('/admin/sync-exercises', undefined, { timeout: SYNC_TIMEOUT }).then(unwrap),
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
      api.get<{ data: types.WeightLog[] }>('/weight', { params, ...listTimeout(params?.limit) }).then(unwrap),
    get:    (id: number) => api.get<{ data: types.WeightLog }>(`/weight/${id}`).then(unwrap),
    log:    (data: { weight: number; notes?: string; logged_at?: string }) =>
      api.post<{ data: types.WeightLog }>('/weight', withLoggedOn(data)).then(unwrap),
    update: (id: number, data: { weight: number; notes?: string; logged_at?: string }) =>
      api.patch<{ data: types.WeightLog }>(`/weight/${id}`, withLoggedOn(data)).then(unwrap),
    delete: (id: number) => api.delete(`/weight/${id}`),
    stats:  () => api.get<{ data: types.WeightStats }>('/weight/stats').then(unwrap),
  }

  const foodAPI = {
    list:    (date?: string) => api.get<{ data: types.FoodLog[] }>('/food', { params: { date } }).then(unwrap),
    log:     (data: any) => api.post<{ data: types.FoodLog }>('/food', withLoggedOn(data)).then(unwrap),
    get:     (id: number) => api.get<{ data: types.FoodLog }>(`/food/${id}`).then(unwrap),
    update:  (id: number, data: any) => api.patch<{ data: types.FoodLog }>(`/food/${id}`, withLoggedOn(data)).then(unwrap),
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

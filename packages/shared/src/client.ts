import axios, { AxiosInstance } from 'axios'
import * as types from './types'
import { StorageAdapter, STORAGE_KEYS } from './storage'
import { normalizeServerUrl } from './utils/serverUrl'
import { networkFailureMessage, type MessageDetail } from './utils/networkError'
import { withLoggedOn, utcOffsetMinutes } from './utils/dateUtils'

// Every API call lives under this versioned path. `origin` is an absolute server
// origin for a cross-origin backend, or '' for the same-origin reverse proxy (web).
const API_BASE_PATH = '/api/v1'
const apiUrl = (origin = '') => `${origin}${API_BASE_PATH}`

export interface ServerInfo {
  name: string
  version: string
  // Optional: a backend older than the REGISTRATION feature omits it. Read it through
  // registrationOpen() so "absent" means open rather than closed.
  registration_open?: boolean
}

// Turn an axios error into an actionable message. Proxy misconfig (404/405) is
// distinguished from real auth and server errors, so connectivity problems don't
// masquerade as "Registration failed." Response-less failures go to the classifier,
// which separates a blocked-cleartext or untrusted-certificate failure from a genuinely
// unreachable server — they are indistinguishable from the axios error alone.
// Whether the server answered "that is not here" rather than failing to answer.
//
// The difference decides whether a screen may offer Try again. Retrying a row that does
// not exist fails identically every time, so the button is a promise the app cannot keep;
// the way out of a 404 is the escape hatch, not the retry. Anything else — a timeout, a
// 5xx, a dropped connection — may well succeed on a second attempt.
export const isNotFound = (err: any): boolean => err?.response?.status === 404
export const apiErrorMessage = (err: any, fallback: string, detail: MessageDetail = 'brief'): string => {
  if (err?.response) {
    const serverError = err.response.data?.error
    if (serverError) return serverError
    const status = err.response.status
    if (status === 404 || status === 405) {
      return "Server URL looks misconfigured — the API endpoint wasn't found. Check Server settings."
    }
    // Ordered ABOVE the HTML sniff on purpose. Every reverse proxy — nginx, Caddy,
    // Traefik — serves its 502 as an HTML page, so sniffing for a document first
    // diagnosed a restarting backend as "check Server settings": wrong, and wrong in the
    // most self-hosted moment there is, when the settings are fine and the stack is
    // mid-upgrade. Status is the stronger signal when we have one.
    if (status === 502 || status === 503 || status === 504) {
      return 'The server is restarting or unreachable. Try again in a moment.'
    }
    // A reverse proxy answers with its own HTML page when the app behind it is down,
    // restarting, or was never there — the body is a document, not our {"error"} envelope.
    // wger's client models this case explicitly (ErrorType.html) because self-hosted setups
    // meet it every time the stack is updated. Falling through to the caller's fallback
    // would report "Couldn't save your workout", hiding an infrastructure problem behind
    // what reads as an app bug.
    const body = err.response.data
    if (typeof body === 'string' && /^\s*<(!doctype|html)/i.test(body)) {
      return 'That address returned a web page, not the Lyftr API. Check Server settings.'
    }
    if (status >= 500) return 'Server error. Please try again shortly.'
    return fallback
  }
  return networkFailureMessage(err, detail)
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
    return { ok: false, message: apiErrorMessage(err, "Couldn't reach the server.", 'full') }
  }
}

const unwrap = <T>(res: { data: { data: T } }) => res.data.data

// The bound every ordinary request shares, INCLUDING the token refresh below. Named
// rather than inlined because the refresh is issued on the bare `axios` export (using
// `api` would recurse straight back into the interceptor that calls it), and a bare
// axios call silently inherits axios's own default of `timeout: 0` — wait forever.
// That gap is #145: a request 401s, the refresh goes out over gym wifi that has just
// stopped forwarding, and nothing ever settles it. The caller's promise stays pending,
// so a button gated on `saving` is disabled for the rest of the process's life while the
// app around it keeps rendering — which is exactly "action buttons stop responding …
// requires a full app restart".
const REQUEST_TIMEOUT = 20000

// Was the session actually revoked, or did we just not hear back? Only the server can
// answer that, and only 400/401/403 are it answering: the refresh token is missing,
// malformed, expired, or superseded. A timeout, a dropped connection, a 5xx, a proxy's
// 502/504 — those are silence, and silence is not a verdict. Signing out on silence
// would end a session, and with it an in-progress workout, every time someone walks past
// a dead spot in their gym's wifi. Verified: before this, restoring connectivity after a
// hung refresh dropped a live workout straight to the login screen.
//
// wger's Flutter client draws the same line and says so in the same terms — "pure network
// errors keep the session intact so offline use continues to work" — but puts 5xx on the
// revoked side, clearing on any non-200. We deliberately keep 5xx here, because both these
// apps talk to a box the user owns: `docker compose up -d` to update the backend means a
// reverse proxy answering 502 for a few seconds, and that must not sign someone out
// mid-workout. A genuinely dead refresh token still 401s, so nothing is left hanging.
const sessionWasRevoked = (err: any): boolean => {
  const status = err?.response?.status
  return status === 400 || status === 401 || status === 403
}

// Build a fully-wired API client bound to a platform storage adapter. All token
// reads/writes and the base-URL resolution go through `storage`, so the same code
// runs on web (localStorage) and mobile (SecureStore/AsyncStorage).
export function createClient(
  storage: StorageAdapter,
  opts: {
    // Called after a token refresh fails — the session is dead. Web passes a
    // `location.href = '/login'`; mobile passes `router.replace('/login')`.
    onAuthFailure?: () => void
    // Optional hard override of the base URL (web passes import.meta.env.VITE_API_URL).
    // When set, the stored server_url is ignored.
    baseUrlOverride?: string
  } = {},
) {
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
    timeout: REQUEST_TIMEOUT,
  })

  api.interceptors.request.use(async (config) => {
    config.baseURL = await resolveAPIBase()
    const token = await storage.get(STORAGE_KEYS.access)
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // Single-flight. A screen that mounts and fires five reads gets five 401s at once, and
  // without this each one opens its own refresh: five round-trips where one would do, five
  // rotations of a token the server invalidates as it reissues it, and last-writer-wins
  // over the storage key. On the network this bug is actually about, it is also five
  // separate REQUEST_TIMEOUT waits. wger's Flutter client shares one future the same way
  // (`_refreshInFlight ??= _runRefresh().whenComplete(...)`), and it is what the axios
  // ecosystem's isRefreshing-flag-plus-queue recipe reduces to once the queue is a promise.
  let refreshInFlight: Promise<string> | null = null

  const refreshSession = async (): Promise<string> => {
    const refreshToken = await storage.get(STORAGE_KEYS.refresh)
    const base = await resolveAPIBase()
    const res = await axios.post(
      `${base}/auth/refresh`,
      { refresh_token: refreshToken },
      { timeout: REQUEST_TIMEOUT },
    )
    const newToken = res.data.data.token
    await storage.set(STORAGE_KEYS.access, newToken)
    if (res.data.data.refresh_token) {
      await storage.set(STORAGE_KEYS.refresh, res.data.data.refresh_token)
    }
    return newToken
  }

  const refreshOnce = (): Promise<string> => {
    refreshInFlight ??= refreshSession().finally(() => { refreshInFlight = null })
    return refreshInFlight
  }

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config
      // A 401 from an endpoint that checks a password in its body is a credential
      // error, not an expired session — let the page show it instead of
      // refreshing/redirecting. /me/password belongs here for the same reason
      // /auth/login does: it answers "that password is wrong", and refreshing would
      // retry, fail again, and sign the user out over a typo.
      const url = original?.url || ''
      const isCredentialCheck = url.includes('/auth/') || url.includes('/me/password')
      if (error.response?.status === 401 && !original._retry && !isCredentialCheck) {
        original._retry = true
        try {
          // Set the header from the token this call returns rather than letting the
          // request interceptor re-read storage: a queued retry that reads storage can
          // pick up a token a later rotation has already replaced.
          const newToken = await refreshOnce()
          original.headers.Authorization = `Bearer ${newToken}`
          return api(original)
        } catch (refreshError) {
          if (sessionWasRevoked(refreshError)) {
            await storage.remove(STORAGE_KEYS.access)
            await storage.remove(STORAGE_KEYS.refresh)
            await storage.remove(STORAGE_KEYS.user)
            opts.onAuthFailure?.()
          } else {
            // Silence leaves the session alone — and the caller hears about the silence,
            // not about the 401 that started this. Rejecting with the original error made
            // a screen show the server's "invalid or expired token", which reads as "your
            // login is broken" when the session is fine and the phone simply could not
            // reach the server. The refresh error routes through networkFailureMessage to
            // "the server didn't respond in time", which is both true and actionable.
            return Promise.reject(refreshError)
          }
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
    // Persisting the returned pair is not optional. The change invalidates every token
    // minted against the old password, this device's included, so skipping this would
    // sign the user out of the very session that made the change — at the next refresh,
    // minutes later, with nothing on screen to connect it to what they did.
    changePassword: async (data: types.ChangePasswordRequest) => {
      const res = await api.put<{ data: types.TokenPair }>('/me/password', data)
      const pair = res.data.data
      await storage.set(STORAGE_KEYS.access, pair.token)
      await storage.set(STORAGE_KEYS.refresh, pair.refresh_token)
    },
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

  // One screenful and change. Small enough that the first page of the picker arrives
  // in one round trip, large enough that scrolling does not fetch constantly. The
  // server caps a page at 100, which is open-exercise-db's own per_page ceiling.
  const DEFAULT_EXERCISE_PAGE_SIZE = 50

  const exerciseAPI = {
    // Every call goes to the server, which queries open-exercise-db and returns one
    // page. There is deliberately no client-side catalog here: the previous version
    // fetched all ~873 rows once and filtered them in memory, which made every app
    // instance a copy of a database it does not own and put the whole catalog behind
    // one slow request before the picker could show anything. Paging keeps the first
    // screen fast and the memory flat, and lets the server's own cache do the work —
    // it holds upstream responses for five minutes, so a repeated search costs it
    // nothing.
    list: (params?: {
      q?: string
      muscle_group?: string
      category?: string
      equipment?: string
      limit?: number
      page?: number
    }) => api.get<{ data: types.Exercise[] }>('/exercises', {
      params: { limit: DEFAULT_EXERCISE_PAGE_SIZE, ...params },
      ...listTimeout(params?.limit),
    }).then(unwrap),
    get: (id: number) => api.get<{ data: types.Exercise }>(`/exercises/${id}`).then(unwrap),
    getPRs: (id: number) => api.get<{ data: types.PersonalRecord }>(`/exercises/${id}/prs`).then(unwrap),
    getHistory: (id: number, limit = 20) => api.get<{ data: types.ExerciseHistoryPoint[] }>(`/exercises/${id}/history`, { params: { limit } }).then(unwrap),
    // Lyftr does not keep its own exercise library. open-exercise-db is the source and
    // is queried live; the server holds only the rows it has had reason to look at, and
    // these three manage that cache rather than a catalog.
    cacheStatus: () => api.get<{ data: { count: number } }>('/admin/seed-status').then(unwrap),
    // Re-reads every row the server already holds, applying upstream corrections. It
    // pulls the full upstream export to do so, which on a cold server runs past the
    // global 20s — the button is an explicit admin action the user waits on, so it gets
    // its own bound. A timeout here would report failure for work that goes on to finish.
    refreshCache: () => api.post<{ data: { refreshed: number } }>('/admin/sync-exercises', undefined, { timeout: SYNC_TIMEOUT }).then(unwrap),
    clearCacheOnServer: () => api.post<{ data: { cleared: number } }>('/admin/reset-exercises', undefined, { timeout: SYNC_TIMEOUT }).then(unwrap),
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

import axios, { AxiosInstance } from 'axios'
import * as types from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api/v1'

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refreshToken = localStorage.getItem('refresh_token')
        const res = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token: refreshToken })
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
  list:   (params?: { limit?: number; offset?: number }) =>
    api.get<{ data: types.Workout[] }>('/workouts', { params }).then(res => unwrap(res)),
  get:    (id: number) => api.get<{ data: types.Workout }>(`/workouts/${id}`).then(res => unwrap(res)),
  create: (data: any) => api.post<{ data: types.Workout }>('/workouts', data).then(res => unwrap(res)),
  delete: (id: number) => api.delete(`/workouts/${id}`),
}

export const exerciseAPI = {
  list:   (params?: { q?: string; muscle_group?: string; category?: string; equipment?: string }) =>
    api.get<{ data: types.Exercise[] }>('/exercises', { params }).then(res => unwrap(res)),
  get:    (id: number) => api.get<{ data: types.Exercise }>(`/exercises/${id}`).then(res => unwrap(res)),
}

export const weightAPI = {
  list:   (params?: { limit?: number }) => api.get<{ data: types.WeightLog[] }>('/weight', { params }).then(res => unwrap(res)),
  log:    (data: { weight: number; notes?: string; logged_at?: string }) =>
    api.post<{ data: types.WeightLog }>('/weight', data).then(res => unwrap(res)),
  delete: (id: number) => api.delete(`/weight/${id}`),
  stats:  () => api.get<{ data: types.WeightStats }>('/weight/stats').then(res => unwrap(res)),
}

export const foodAPI = {
  list:   (date?: string) => api.get<{ data: types.FoodLog[] }>('/food', { params: { date } }).then(res => unwrap(res)),
  log:    (data: any) => api.post<{ data: types.FoodLog }>('/food', data).then(res => unwrap(res)),
  delete: (id: number) => api.delete(`/food/${id}`),
  stats:  (date?: string) => api.get<{ data: types.DailyStats }>('/food/stats', { params: { date } }).then(res => unwrap(res)),
}

export default api

import axios, { AxiosInstance } from 'axios'
import * as types from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api'

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const refreshToken = localStorage.getItem('refresh_token')
        const response = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token: refreshToken })
        localStorage.setItem('access_token', response.data.access_token)
        originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`
        return api(originalRequest)
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }
)

export const authAPI = {
  login: (data: types.LoginRequest) => api.post<types.AuthResponse>('/auth/login', data),
  register: (data: types.RegisterRequest) => api.post<types.AuthResponse>('/auth/register', data),
  logout: () => api.post('/auth/logout'),
}

export const workoutAPI = {
  list: (params?: { start_date?: string; end_date?: string }) =>
    api.get<types.Workout[]>('/workouts', { params }),
  get: (id: number) => api.get<types.Workout>(`/workouts/${id}`),
  create: (data: Omit<types.Workout, 'id' | 'created_at'>) =>
    api.post<types.Workout>('/workouts', data),
  update: (id: number, data: Partial<types.Workout>) =>
    api.put<types.Workout>(`/workouts/${id}`, data),
  delete: (id: number) => api.delete(`/workouts/${id}`),
}

export const exerciseAPI = {
  list: () => api.get<types.Exercise[]>('/exercises'),
  search: (q: string) => api.get<types.Exercise[]>('/exercises', { params: { q } }),
}

export const foodAPI = {
  list: (date: string) => api.get<types.FoodLog[]>('/food-logs', { params: { date } }),
  search: (q: string) => api.get<any>('/food-search', { params: { q } }),
  create: (data: Omit<types.FoodLog, 'id'>) => api.post<types.FoodLog>('/food-logs', data),
  update: (id: number, data: Partial<types.FoodLog>) =>
    api.put<types.FoodLog>(`/food-logs/${id}`, data),
  delete: (id: number) => api.delete(`/food-logs/${id}`),
}

export const weightAPI = {
  list: (params?: { start_date?: string; end_date?: string }) =>
    api.get<types.Weight[]>('/weight', { params }),
  create: (data: Omit<types.Weight, 'id'>) => api.post<types.Weight>('/weight', data),
  update: (id: number, data: Partial<types.Weight>) =>
    api.put<types.Weight>(`/weight/${id}`, data),
  delete: (id: number) => api.delete(`/weight/${id}`),
}

export const userAPI = {
  getProfile: () => api.get<types.User>('/user'),
  updateProfile: (data: Partial<types.User>) => api.put<types.User>('/user', data),
}

export default api

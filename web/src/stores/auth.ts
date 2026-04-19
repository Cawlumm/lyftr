import { create } from 'zustand'
import * as types from '../types'
import { authAPI } from '../services/api'

interface AuthStore {
  user: types.User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login:     (email: string, password: string) => Promise<void>
  register:  (email: string, password: string) => Promise<void>
  logout:    () => void
  clearError: () => void
}

export const useAuthStore = create<AuthStore>((set) => {
  const token   = localStorage.getItem('access_token')
  const userStr = localStorage.getItem('user')
  const user    = userStr ? JSON.parse(userStr) : null

  return {
    user,
    isAuthenticated: !!token && !!user,
    isLoading: false,
    error: null,

    login: async (email, password) => {
      set({ isLoading: true, error: null })
      try {
        const data = await authAPI.login({ email, password })
        localStorage.setItem('access_token', data.token)
        localStorage.setItem('refresh_token', data.refresh_token)
        localStorage.setItem('user', JSON.stringify(data.user))
        set({ user: data.user, isAuthenticated: true, isLoading: false })
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Login failed', isLoading: false })
        throw err
      }
    },

    register: async (email, password) => {
      set({ isLoading: true, error: null })
      try {
        const data = await authAPI.register({ email, password })
        localStorage.setItem('access_token', data.token)
        localStorage.setItem('refresh_token', data.refresh_token)
        localStorage.setItem('user', JSON.stringify(data.user))
        set({ user: data.user, isAuthenticated: true, isLoading: false })
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Registration failed', isLoading: false })
        throw err
      }
    },

    logout: () => {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')
      set({ user: null, isAuthenticated: false, error: null })
    },

    clearError: () => set({ error: null }),
  }
})

import { create } from 'zustand'
import * as types from '../types'
import { authAPI } from '../services/api'

interface AuthStore {
  user: types.User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, passwordConfirm: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: types.User | null) => void
  clearError: () => void
}

export const useAuthStore = create<AuthStore>((set) => {
  // Hydrate from localStorage on init
  const token = localStorage.getItem('access_token')
  const userStr = localStorage.getItem('user')
  const user = userStr ? JSON.parse(userStr) : null

  return {
    user,
    isAuthenticated: !!token && !!user,
    isLoading: false,
    error: null,

    login: async (email: string, password: string) => {
      set({ isLoading: true, error: null })
      try {
        const response = await authAPI.login({ email, password })
        localStorage.setItem('access_token', response.data.access_token)
        localStorage.setItem('refresh_token', response.data.refresh_token)
        localStorage.setItem('user', JSON.stringify(response.data.user))
        set({ user: response.data.user, isAuthenticated: true, isLoading: false })
      } catch (error: any) {
        const message = error.response?.data?.error || 'Login failed'
        set({ error: message, isLoading: false })
        throw error
      }
    },

    register: async (email: string, password: string, passwordConfirm: string) => {
      set({ isLoading: true, error: null })
      try {
        const response = await authAPI.register({ email, password, password_confirm: passwordConfirm })
        localStorage.setItem('access_token', response.data.access_token)
        localStorage.setItem('refresh_token', response.data.refresh_token)
        localStorage.setItem('user', JSON.stringify(response.data.user))
        set({ user: response.data.user, isAuthenticated: true, isLoading: false })
      } catch (error: any) {
        const message = error.response?.data?.error || 'Registration failed'
        set({ error: message, isLoading: false })
        throw error
      }
    },

    logout: async () => {
      try {
        await authAPI.logout()
      } catch {
        // Continue logout even if API call fails
      }
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')
      set({ user: null, isAuthenticated: false, error: null })
    },

    setUser: (user) => {
      set({ user })
      if (user) {
        localStorage.setItem('user', JSON.stringify(user))
      }
    },

    clearError: () => set({ error: null }),
  }
})

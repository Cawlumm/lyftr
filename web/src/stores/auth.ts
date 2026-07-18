import { create } from 'zustand'
import * as types from '../types'
import { authAPI, clearSession } from '../services/api'
import { useWorkoutSession } from './workoutSession'

interface AuthStore {
  user: types.User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login:     (email: string, password: string) => Promise<void>
  register:  (email: string, password: string) => Promise<void>
  logout:    () => Promise<void>
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
        // A previous user on this (possibly shared) device may have left an
        // in-progress workout in localStorage without logging out — don't let
        // it get attributed to whoever just logged in.
        useWorkoutSession.getState().cancelSession()
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
        useWorkoutSession.getState().cancelSession()
        localStorage.setItem('access_token', data.token)
        localStorage.setItem('refresh_token', data.refresh_token)
        localStorage.setItem('user', JSON.stringify(data.user))
        set({ user: data.user, isAuthenticated: true, isLoading: false })
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Registration failed', isLoading: false })
        throw err
      }
    },

    logout: async () => {
      await clearSession()
      set({ user: null, isAuthenticated: false, error: null })
    },

    clearError: () => set({ error: null }),
  }
})

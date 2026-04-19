import { create } from 'zustand'

interface ServerStore {
  serverUrl: string
  setServerUrl: (url: string) => void
  getServerUrl: () => string
}

const DEFAULT_SERVER = 'http://localhost:3000'

export const useServerStore = create<ServerStore>((set, get) => {
  const stored = localStorage.getItem('server_url') || DEFAULT_SERVER

  return {
    serverUrl: stored,

    setServerUrl: (url: string) => {
      const normalized = url.trim().replace(/\/$/, '')
      localStorage.setItem('server_url', normalized)
      set({ serverUrl: normalized })
    },

    getServerUrl: () => {
      return get().serverUrl
    },
  }
})

import { create } from 'zustand'
import api from '../lib/api'

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access'),

  login: async (username, password) => {
    const { data } = await api.post('/auth/login/', { username, password })
    localStorage.setItem('access', data.access)
    localStorage.setItem('refresh', data.refresh)
    const profile = await api.get('/auth/profile/')
    set({ user: profile.data, isAuthenticated: true })
  },

  register: async (payload) => {
    const { data } = await api.post('/auth/register/', payload)
    localStorage.setItem('access', data.access)
    localStorage.setItem('refresh', data.refresh)
    set({ user: data.user, isAuthenticated: true })
  },

  fetchProfile: async () => {
    try {
      const { data } = await api.get('/auth/profile/')
      set({ user: data, isAuthenticated: true })
    } catch {
      set({ user: null, isAuthenticated: false })
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout/', { refresh: localStorage.getItem('refresh') })
    } finally {
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      set({ user: null, isAuthenticated: false })
    }
  },

  updateProfile: (data) => set((s) => ({ user: { ...s.user, ...data } })),
}))

export default useAuthStore

/**
 * api.js — Axios client pre-configured for the FastAPI backend.
 *
 * Automatically injects `Authorization: Bearer <token>` from the active
 * Supabase session for every request. No need to pass the token manually
 * in individual component calls.
 */
import axios from 'axios'
import { supabase } from './supabase'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Request Interceptor: attach Bearer token ──────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`
      }
    } catch {
      // Session retrieval failed — send unauthenticated request
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response Interceptor: normalize errors ─────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status  = error.response?.status
    const detail  = error.response?.data?.detail ?? error.message

    if (status === 401) {
      // Token expired or invalid — Supabase will auto-refresh; optionally redirect
      console.warn('[API] 401 Unauthorized:', detail)
    } else if (status === 403) {
      console.warn('[API] 403 Forbidden:', detail)
    }

    return Promise.reject({
      status,
      detail,
      raw: error,
    })
  }
)

export default api

// ── Convenience health check ───────────────────────────────────────────────────
export const checkHealth = () => api.get('/health')

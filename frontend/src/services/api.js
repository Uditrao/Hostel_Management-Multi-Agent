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
  timeout: 30000,  // 30s default — enough for most API calls
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

// ── Convenience API Services ───────────────────────────────────────────────────

export const checkHealth = () => api.get('/health')

export const authApi = {
  getMe: () => api.get('/auth/me'),
}

export const irisApi = {
  getStatus: () => api.get('/iris/status'),
  // 90s timeout: Facenet512 TF model cold-start takes ~10s on first request
  enroll: (formData) =>
    api.post('/iris/enroll', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90000,
    }),
}

export const sentinelApi = {
  getStatus: () => api.get('/sentinel/status'),
  getWindow: () => api.get('/sentinel/window'),
  getAttendance: (studentId, limit = 50) =>
    api.get('/sentinel/attendance', {
      params: { student_id: studentId, limit },
    }),
}

export const fixrApi = {
  getStatus: () => api.get('/fixr/status'),
  submitComplaint: (studentId, rawText) =>
    api.post('/fixr/complaint', {
      student_id: studentId,
      raw_text: rawText,
    }),
  getMyComplaints: (studentId, status = null, limit = 50, offset = 0) =>
    api.get('/fixr/complaints/mine', {
      params: {
        student_id: studentId,
        ...(status ? { status } : {}),
        limit,
        offset,
      },
    }),
}

export const nourishApi = {
  getStatus: () => api.get('/nourish/status'),
  getEntries: (targetDate = null) =>
    api.get('/nourish/entries', {
      params: targetDate ? { target_date: targetDate } : {},
    }),
  getMealEntries: (mealType, targetDate = null, limit = 100, offset = 0) =>
    api.get(`/nourish/entries/${mealType}`, {
      params: {
        ...(targetDate ? { target_date: targetDate } : {}),
        limit,
        offset,
      },
    }),
  getMealWindows: () => api.get('/nourish/meal-windows'),
  getInventory: () => api.get('/nourish/inventory'),
  updateStock: ({ item_name, action, quantity, unit, updated_by = null }) =>
    api.post('/nourish/inventory/update', {
      item_name,
      action,
      quantity: Number(quantity),
      unit,
      updated_by,
    }),
  getAlerts: (urgency = null) =>
    api.get('/nourish/inventory/alerts', {
      params: urgency ? { urgency } : {},
    }),
  resolveAlert: (alertId) =>
    api.post(`/nourish/inventory/alerts/${alertId}/resolve`),
  runDepletion: (mealType, targetDate = null) =>
    api.post('/nourish/depletion', {
      meal_type: mealType,
      target_date: targetDate,
    }),
  uploadMenuPdf: (formData) =>
    api.post('/nourish/menu/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  saveConfirmedMenu: (payload) =>
    api.post('/nourish/menu/save', payload),
  getCurrentMenu: (mealType, targetDate = null) =>
    api.get(`/nourish/menu/${mealType}`, {
      params: targetDate ? { target_date: targetDate } : {},
    }),
  listMenus: (limit = 20, offset = 0) =>
    api.get('/nourish/menus', { params: { limit, offset } }),
  executeCommand: (command, staffId = null) =>
    api.post('/nourish/inventory/command', {
      command,
      staff_id: staffId,
    }),
  getCommandLogs: (limit = 20, offset = 0) =>
    api.get('/nourish/inventory/command-logs', {
      params: { limit, offset },
    }),
}



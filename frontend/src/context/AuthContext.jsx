/**
 * AuthContext.jsx
 * ================
 * Global auth state provider powered by Supabase.
 * Includes defensive timeout and offline resilience to prevent infinite loading.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

// ── Role utilities ─────────────────────────────────────────────────────────────

function extractRole(user) {
  if (!user) return null
  return (
    user.user_metadata?.role ||
    user.app_metadata?.role  ||
    null
  )
}

function getRoleHomePath(role) {
  switch (role) {
    case 'warden':     return '/warden/dashboard'
    case 'mess_staff': return '/mess/dashboard'
    case 'student':    return '/student/dashboard'
    default:           return '/'
  }
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [role,    setRole]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return null

      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/auth/me`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        return data
      }
      if (res.status === 401) {
        await supabase.auth.signOut().catch(() => {})
        setUser(null)
        setRole(null)
        setProfile(null)
        return null
      }
    } catch {
      // Backend maybe offline
    }
    return null
  }, [])

  function syncFromSession(session) {
    const u = session?.user ?? null
    setUser(u)
    setRole(extractRole(u))
    if (u) {
      fetchProfile()
    } else {
      setProfile(null)
    }
  }

  useEffect(() => {
    let resolved = false

    // Safety timeout: Never leave user on blank loading screen if Supabase stalls
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        setLoading(false)
      }
    }, 1500)

    // 1. Load existing session on mount
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!resolved) {
          syncFromSession(data?.session)
          resolved = true
          setLoading(false)
        }
      })
      .catch((err) => {
        console.warn('Session resolution caught error:', err)
        if (!resolved) {
          resolved = true
          setLoading(false)
        }
      })

    // 2. Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        syncFromSession(session)
        setLoading(false)
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription?.unsubscribe()
    }
  }, [fetchProfile])

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error }
    } catch (err) {
      return { error: { message: err?.message || 'Login failed.' } }
    }
  }, [])

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore
    }
    setUser(null)
    setRole(null)
    setProfile(null)
  }, [])

  // ── Signup ─────────────────────────────────────────────────────────────────
  const signup = useCallback(async ({ email, password, full_name, roll_no, room_no }) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/auth/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            full_name,
            roll_no,
            room_no,
            role: 'student',
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        return { error: { message: data.detail || 'Signup failed. Please try again.' } }
      }
      return { data, error: null }
    } catch {
      return {
        error: {
          message: 'Unable to connect to backend server. Please verify FastAPI is running on http://127.0.0.1:8000.',
        },
      }
    }
  }, [])

  const getRoleHome = useCallback(() => getRoleHomePath(role), [role])

  const value = {
    user,
    role,
    profile,
    studentProfile: profile?.student_profile ?? null,
    refreshProfile: fetchProfile,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    signup,
    getRoleHome,
    getRoleHomePath,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

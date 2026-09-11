/**
 * AuthContext.jsx
 * ================
 * Global auth state provider powered by Supabase.
 *
 * Provides:
 *   - user         : Supabase user object (null if unauthenticated)
 *   - role         : 'student' | 'warden' | 'mess_staff' | 'kiosk' | null
 *   - isAuthenticated
 *   - loading      : true while initial session is being resolved
 *   - login(email, password)  → { error }
 *   - logout()
 *   - signup(fields)          → { error }
 *   - getRoleHome()           → redirect path for current role
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

// ── Role utilities ─────────────────────────────────────────────────────────────

/**
 * Extract our application role from a Supabase user object.
 * Role is stored in user_metadata.role by convention.
 */
function extractRole(user) {
  if (!user) return null
  return (
    user.user_metadata?.role ||
    user.app_metadata?.role  ||
    null
  )
}

/** Map a role to its default portal path */
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
  const [loading, setLoading] = useState(true)

  // Sync state from Supabase session
  function syncFromSession(session) {
    const u = session?.user ?? null
    setUser(u)
    setRole(extractRole(u))
  }

  useEffect(() => {
    // 1. Load existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncFromSession(session)
      setLoading(false)
    })

    // 2. Subscribe to future auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        syncFromSession(session)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // ── Signup (student self-registration) ─────────────────────────────────────
  const signup = useCallback(async ({ email, password, full_name, roll_no, room_no }) => {
    // 1. Create Supabase auth user with role in metadata
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role: 'student', full_name, roll_no, room_no },
      },
    })
    if (signupError) return { error: signupError }

    // 2. Post to backend /auth/signup to create users row (pending approval)
    try {
      const token = data.session?.access_token
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/auth/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ email, password, full_name, roll_no, room_no, role: 'student' }),
        }
      )
      if (!res.ok) {
        const body = await res.json()
        return { error: { message: body.detail ?? 'Signup failed' } }
      }
    } catch (_e) {
      return { error: { message: 'Backend unreachable. Try again later.' } }
    }

    return { error: null }
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getRoleHome = useCallback(() => getRoleHomePath(role), [role])

  const value = {
    user,
    role,
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

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

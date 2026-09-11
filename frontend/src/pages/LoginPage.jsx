/**
 * LoginPage.jsx
 * =============
 * Unified login for all roles — uses Supabase email/password auth.
 * Includes quick-fill demo buttons for easy development testing.
 */
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, LogIn, Cpu } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/common/LoadingSpinner'

// Demo credentials for quick testing — REMOVE in production
const DEMO_ACCOUNTS = [
  { role: 'warden',     email: 'warden@hostel.com',     password: 'warden123',  label: 'Warden',      color: 'badge-violet' },
  { role: 'mess_staff', email: 'mess@hostel.com',        password: 'mess123',    label: 'Mess Staff',  color: 'badge-amber'  },
  { role: 'student',    email: 'student@hostel.com',     password: 'student123', label: 'Student',     color: 'badge-cyan'   },
]

export default function LoginPage() {
  const { login, isAuthenticated, loading: authLoading, getRoleHome } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get('redirect') || null

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  // Already authenticated → go to portal
  if (!authLoading && isAuthenticated) {
    navigate(redirectTo || getRoleHome(), { replace: true })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: loginError } = await login(email.trim(), password)
    setLoading(false)
    if (loginError) {
      setError(loginError.message ?? 'Login failed. Check your credentials.')
      return
    }
    navigate(redirectTo || getRoleHome(), { replace: true })
  }

  const fillDemo = (demo) => {
    setEmail(demo.email)
    setPassword(demo.password)
    setError(null)
  }

  return (
    <div className="bg-hostel min-h-screen flex flex-col items-center justify-center px-4">
      {/* Card */}
      <div className="w-full max-w-md animate-slide-up">

        {/* Logo mark */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center shadow-glow-violet">
            <Cpu className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              Hostel<span className="text-violet-400">OS</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to your portal</p>
          </div>
        </div>

        <div className="card">
          {/* Demo quick-fill */}
          <div className="mb-5">
            <p className="section-label">Quick demo login</p>
            <div className="flex gap-2 flex-wrap">
              {DEMO_ACCOUNTS.map((demo) => (
                <button
                  key={demo.role}
                  type="button"
                  id={`demo-login-${demo.role}`}
                  onClick={() => fillDemo(demo)}
                  className={`badge ${demo.color} cursor-pointer hover:opacity-80 transition-opacity py-1.5 px-3 text-xs`}
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divider" />

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-400 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@hostel.com"
                  className="input-field pl-10"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="glass border border-rose-500/30 rounded-xl px-4 py-3 text-sm text-rose-400 animate-fade-in">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2 mt-1"
            >
              {loading ? <LoadingSpinner size="sm" /> : <LogIn className="w-4 h-4" />}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Signup link */}
          <p className="text-center text-sm text-slate-500 mt-5">
            New student?{' '}
            <Link to="/signup" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

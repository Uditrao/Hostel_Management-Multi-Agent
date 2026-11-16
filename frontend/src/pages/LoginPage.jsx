/**
 * LoginPage.jsx
 * =============
 * Architectural Monochromatic Authentication Interface.
 * Built with pure black, dark charcoal, slate grey, off-white, and sharp borders.
 */
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, LogIn, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import BrandLogo from '../components/common/BrandLogo'

const DEMO_ACCOUNTS = [
  { role: 'warden',     email: 'warden@hostel.com',     password: 'warden123',  label: 'WARDEN ADMIN' },
  { role: 'mess_staff', email: 'mess@hostel.com',        password: 'mess1234',   label: 'DINING STAFF' },
  { role: 'student',    email: 'student@hostel.com',     password: 'student123', label: 'RESIDENT' },
]

export default function LoginPage() {
  const { login, logout, role, isAuthenticated, user, getRoleHome } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get('redirect') || null

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: loginError } = await login(email.trim(), password)
    setLoading(false)
    if (loginError) {
      setError(loginError.message ?? 'Authentication rejected. Verify credentials.')
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
    <div className="bg-[#080808] min-h-screen flex flex-col justify-center items-center px-4 py-12 font-sans text-[#e0e0e0]">
      <div className="w-full max-w-md">

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <BrandLogo size={42} className="mb-4" />
          <h1 className="text-xl font-bold text-white tracking-widest font-mono uppercase">
            KINESIS<span className="text-[#888888]">/GATEWAY</span>
          </h1>
          <p className="text-xs text-[#777777] font-mono mt-1">SECURE ACCESS TO FACILITY SYSTEM</p>
        </div>

        {/* Main Card */}
        <div className="bg-[#0d0d0d] border border-[#262626] p-6 sm:p-8">

          {/* Active Session Notice */}
          {isAuthenticated && user && (
            <div className="mb-6 p-3 bg-[#141414] border border-[#333333] flex items-center justify-between gap-3 text-xs font-mono">
              <div className="min-w-0">
                <p className="text-white truncate">
                  ACTIVE: <strong>{user.email}</strong>
                </p>
                <p className="text-[10px] text-[#777777] uppercase">CLEARANCE: {role || 'RESIDENT'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate(redirectTo || getRoleHome())}
                  className="px-2.5 py-1 bg-white text-black font-semibold text-[10px] uppercase tracking-wider"
                >
                  CONSOLE
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await logout()
                    setEmail('')
                    setPassword('')
                  }}
                  className="px-2.5 py-1 bg-[#222222] hover:bg-[#333333] text-white text-[10px] uppercase"
                >
                  DISCONNECT
                </button>
              </div>
            </div>
          )}

          {/* Quick Demo Credentials */}
          <div className="mb-6 pb-5 border-b border-[#202020]">
            <p className="text-[10px] uppercase tracking-widest text-[#777777] font-semibold mb-2.5 font-mono">
              PRESET CLEARANCES (DEV TEST)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((demo) => (
                <button
                  key={demo.role}
                  type="button"
                  id={`demo-login-${demo.role}`}
                  onClick={() => fillDemo(demo)}
                  className="px-2 py-2 bg-[#141414] hover:bg-[#202020] border border-[#2b2b2b] hover:border-[#666666] text-[10px] font-mono font-medium text-[#cccccc] transition-colors text-center"
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 font-mono">
            <div>
              <label htmlFor="login-email" className="block text-[11px] uppercase tracking-wider text-[#aaaaaa] mb-1.5">
                INSTITUTIONAL EMAIL
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="identity@hostel.edu"
                  className="input-field pl-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-[11px] uppercase tracking-wider text-[#aaaaaa] mb-1.5">
                ACCESS CIPHER
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pl-9 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555555] hover:text-white transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-[#1f1414] border border-[#522929] text-[11px] text-[#e49191]">
                {error}
              </div>
            )}

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-3"
            >
              {loading ? <LoadingSpinner size="sm" /> : <LogIn className="w-4 h-4" />}
              <span>{loading ? 'AUTHENTICATING…' : 'ENTER FACILITY SYSTEM'}</span>
            </button>
          </form>

          {/* Registration link */}
          <div className="mt-6 pt-4 border-t border-[#202020] text-center font-mono">
            <p className="text-xs text-[#777777]">
              Unregistered Resident?{' '}
              <Link to="/signup" className="text-white hover:underline font-medium">
                Submit Enrollment Request
              </Link>
            </p>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-6 text-center font-mono">
          <Link to="/" className="text-xs text-[#666666] hover:text-[#999999] transition-colors">
            ← RETURN TO SYSTEM ARCHITECTURE
          </Link>
        </div>
      </div>
    </div>
  )
}

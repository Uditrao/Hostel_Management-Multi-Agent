/**
 * SignupPage.jsx
 * ==============
 * Student self-registration form.
 * Creates Supabase auth user + posts to /auth/signup for warden approval flow.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Mail, Lock, User, Hash, DoorOpen, Eye, EyeOff, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function SignupPage() {
  const { signup } = useAuth()

  const [form, setForm] = useState({
    full_name: '',
    email:     '',
    roll_no:   '',
    room_no:   '',
    password:  '',
    confirm:   '',
  })
  const [showPass,  setShowPass]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [success,   setSuccess]   = useState(false)

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const { error: signupError } = await signup({
      email:     form.email.trim(),
      password:  form.password,
      full_name: form.full_name.trim(),
      roll_no:   form.roll_no.trim(),
      room_no:   form.room_no.trim(),
    })
    setLoading(false)

    if (signupError) {
      setError(signupError.message ?? 'Signup failed. Please try again.')
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <div className="bg-hostel min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Account Submitted!</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Your account is pending <span className="text-violet-400 font-medium">Warden approval</span>.
            You will be able to log in once the warden approves your registration.
          </p>
          <Link to="/login" className="btn-primary inline-flex items-center gap-2">
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-hostel min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-slide-up">

        {/* Header */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center shadow-glow-violet">
            <Cpu className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Create Account</h1>
            <p className="text-sm text-slate-500 mt-1">Student registration — requires warden approval</p>
          </div>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Full Name */}
            <div>
              <label htmlFor="signup-fullname" className="block text-xs font-medium text-slate-400 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="signup-fullname"
                  type="text"
                  required
                  value={form.full_name}
                  onChange={update('full_name')}
                  placeholder="Rahul Sharma"
                  className="input-field pl-10"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="block text-xs font-medium text-slate-400 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="signup-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={update('email')}
                  placeholder="you@college.edu"
                  className="input-field pl-10"
                />
              </div>
            </div>

            {/* Roll No + Room No */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-rollno" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Roll No
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="signup-rollno"
                    type="text"
                    required
                    value={form.roll_no}
                    onChange={update('roll_no')}
                    placeholder="CS2101"
                    className="input-field pl-10"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="signup-roomno" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Room No
                </label>
                <div className="relative">
                  <DoorOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="signup-roomno"
                    type="text"
                    required
                    value={form.room_no}
                    onChange={update('room_no')}
                    placeholder="A-204"
                    className="input-field pl-10"
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="signup-password" className="block text-xs font-medium text-slate-400 mb-1.5">
                Password <span className="text-slate-600">(min 8 chars)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="signup-password"
                  type={showPass ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={update('password')}
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

            {/* Confirm password */}
            <div>
              <label htmlFor="signup-confirm" className="block text-xs font-medium text-slate-400 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="signup-confirm"
                  type={showPass ? 'text' : 'password'}
                  required
                  value={form.confirm}
                  onChange={update('confirm')}
                  placeholder="••••••••"
                  className="input-field pl-10"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="glass border border-rose-500/30 rounded-xl px-4 py-3 text-sm text-rose-400 animate-fade-in">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="signup-submit-btn"
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2 mt-1"
            >
              {loading ? <LoadingSpinner size="sm" /> : <UserPlus className="w-4 h-4" />}
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

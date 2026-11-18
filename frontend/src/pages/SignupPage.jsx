/**
 * SignupPage.jsx
 * ==============
 * Architectural Monochromatic Resident Registration Interface.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, User, Hash, DoorOpen, Eye, EyeOff, UserPlus, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import BrandLogo from '../components/common/BrandLogo'

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
      setError('Password and confirmation do not match.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters in length.')
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
      setError(signupError.message ?? 'Enrollment submission failed. Please try again.')
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <div className="bg-[#080808] min-h-screen flex items-center justify-center px-4 py-12 font-sans text-[#e0e0e0]">
        <div className="bg-[#0d0d0d] border border-[#2b2b2b] max-w-md w-full p-8 text-center font-mono">
          <div className="w-12 h-12 bg-white text-black flex items-center justify-center mx-auto mb-5">
            <Check className="w-6 h-6 stroke-[3]" />
          </div>
          <h2 className="text-base font-bold text-white uppercase tracking-wider mb-2">APPLICATION QUEUED</h2>
          <p className="text-[#888888] text-xs leading-relaxed mb-6 font-sans">
            Your resident credential request has been dispatched to the <strong className="text-white">Warden Verification Roster</strong>. Once roll and room allocation are verified, facial biometric vectoring will be enabled.
          </p>
          <Link to="/login" className="btn-primary w-full">
            Proceed to Login Gateway
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#080808] min-h-screen flex flex-col justify-center items-center px-4 py-12 font-sans text-[#e0e0e0]">
      <div className="w-full max-w-lg">

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center font-mono">
          <BrandLogo size={52} className="mb-4" />
          <h1 className="text-xl font-bold text-white tracking-widest uppercase">
            COHAVEN<span className="text-[#888888]">OS</span>
          </h1>
          <p className="text-xs text-[#777777] mt-1">RESIDENT ENROLLMENT & OCCUPANCY REGISTRATION</p>
        </div>

        {/* Main Form Card */}
        <div className="bg-[#0d0d0d] border border-[#262626] p-6 sm:p-8 font-mono">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#aaaaaa] mb-1.5">
                  FULL NAME
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
                  <input
                    type="text"
                    required
                    value={form.full_name}
                    onChange={update('full_name')}
                    placeholder="Jane Doe"
                    className="input-field pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#aaaaaa] mb-1.5">
                  INSTITUTIONAL EMAIL
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={update('email')}
                    placeholder="student@hostel.edu"
                    className="input-field pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#aaaaaa] mb-1.5">
                  STUDENT ROLL ID
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
                  <input
                    type="text"
                    required
                    value={form.roll_no}
                    onChange={update('roll_no')}
                    placeholder="2024CS082"
                    className="input-field pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#aaaaaa] mb-1.5">
                  ROOM NUMBER
                </label>
                <div className="relative">
                  <DoorOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
                  <input
                    type="text"
                    required
                    value={form.room_no}
                    onChange={update('room_no')}
                    placeholder="B-204"
                    className="input-field pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#aaaaaa] mb-1.5">
                  PASSWORD (MIN 8)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={form.password}
                    onChange={update('password')}
                    placeholder="••••••••"
                    className="input-field pl-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555555] hover:text-white"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#aaaaaa] mb-1.5">
                  CONFIRM PASSWORD
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={form.confirm}
                    onChange={update('confirm')}
                    placeholder="••••••••"
                    className="input-field pl-9"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-[#1f1414] border border-[#522929] text-[11px] text-[#e49191]">
                {error}
              </div>
            )}

            <button
              id="signup-submit-btn"
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-3"
            >
              {loading ? <LoadingSpinner size="sm" /> : <UserPlus className="w-4 h-4" />}
              <span>{loading ? 'TRANSMITTING ENROLLMENT…' : 'SUBMIT RESIDENT APPLICATION'}</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#202020] text-center font-mono">
            <p className="text-xs text-[#777777]">
              Already verified by Warden?{' '}
              <Link to="/login" className="text-white hover:underline font-medium">
                Access Login Gateway
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center font-mono">
          <Link to="/" className="text-xs text-[#666666] hover:text-[#999999] transition-colors">
            ← RETURN TO SYSTEM ARCHITECTURE
          </Link>
        </div>
      </div>
    </div>
  )
}

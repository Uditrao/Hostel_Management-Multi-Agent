/**
 * HomePage.jsx
 * ============
 * Public landing page — accessible without authentication.
 * Shows an overview of the system and quick portal entry buttons.
 * Authenticated users are shown a quick link to their own portal.
 */
import { Link, Navigate } from 'react-router-dom'
import { Shield, Eye, Utensils, Wrench, Activity, ArrowRight, Cpu } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/common/LoadingSpinner'

const agents = [
  {
    icon: Eye,
    name: 'IRIS',
    tagline: 'Face Recognition Engine',
    description: 'MobileFaceNet-powered biometric attendance — enroll once, verify forever.',
    color: 'text-cyan-400',
    glow:  'shadow-glow-cyan',
    bg:    'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: Shield,
    name: 'SENTINEL',
    tagline: 'Attendance & Gate Intelligence',
    description: 'Real-time gate scanning, time-window enforcement, and defaulter detection.',
    color: 'text-violet-400',
    glow:  'shadow-glow-violet',
    bg:    'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: Utensils,
    name: 'NOURISH',
    tagline: 'Mess & Inventory Manager',
    description: 'Live stock tracking, meal entry logging, PDF menu parsing, NLP stock commands.',
    color: 'text-emerald-400',
    glow:  'shadow-glow-emerald',
    bg:    'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Wrench,
    name: 'FIXR',
    tagline: 'Maintenance Request System',
    description: 'AI-classified complaint tickets with urgency detection and warden assignment.',
    color: 'text-rose-400',
    glow:  'shadow-glow-rose',
    bg:    'bg-rose-500/10 border-rose-500/20',
  },
  {
    icon: Activity,
    name: 'HERALD',
    tagline: 'Cross-Agent Anomaly Orchestrator',
    description: 'Nightly sweep across all agents — flags anomalies and generates warden summaries.',
    color: 'text-amber-400',
    glow:  'shadow-glow-amber',
    bg:    'bg-amber-500/10 border-amber-500/20',
  },
]

const portals = [
  { role: 'student',    path: '/student/dashboard',  label: 'Student Portal',    badge: 'badge-cyan',    color: 'hover:shadow-glow-cyan'    },
  { role: 'mess_staff', path: '/mess/dashboard',     label: 'Mess Staff Portal', badge: 'badge-amber',   color: 'hover:shadow-glow-amber'   },
  { role: 'warden',     path: '/warden/dashboard',   label: 'Warden Portal',     badge: 'badge-violet',  color: 'hover:shadow-glow-violet'  },
]

export default function HomePage() {
  const { isAuthenticated, loading, role, getRoleHome } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-hostel">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // Redirect authenticated users straight to their portal
  if (isAuthenticated && role) {
    return <Navigate to={getRoleHome()} replace />
  }

  return (
    <div className="bg-hostel min-h-screen">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 sm:px-6 pt-24 pb-20 text-center">
        {/* Background decorative circles */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[600px] h-[600px] rounded-full bg-violet-600/5 blur-3xl" />
        </div>

        <div className="relative z-10 animate-slide-up max-w-3xl mx-auto">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center shadow-glow-violet">
              <Cpu className="w-8 h-8 text-white" />
            </div>
          </div>

          <div className="badge badge-violet mx-auto mb-4">Multi-Agent AI System</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-100 tracking-tight mb-4 leading-tight">
            Hostel<span className="text-violet-400">OS</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
            A smart, multi-agent platform for hostel management — powered by face recognition,
            AI classification, and real-time anomaly detection.
          </p>

          {/* Portal entry buttons */}
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/login"
              id="home-login-btn"
              className="btn-primary flex items-center gap-2"
            >
              Sign In <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/signup"
              id="home-signup-btn"
              className="btn-secondary flex items-center gap-2"
            >
              Student Sign Up
            </Link>
          </div>

          {/* Quick portal links for demo */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {portals.map(({ path, label, color }) => (
              <Link
                key={path}
                to="/login"
                state={{ redirect: path }}
                className={`glass px-4 py-2 rounded-xl text-sm font-medium text-slate-300 border border-white/10 transition-all duration-200 ${color}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Agent Cards ───────────────────────────────────────────────────── */}
      <section className="max-w-screen-xl mx-auto px-4 sm:px-6 pb-20">
        <p className="section-label text-center mb-8">The Agents</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map(({ icon: Icon, name, tagline, description, color, bg }) => (
            <div key={name} className={`card border ${bg} animate-fade-in`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${bg} border flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <p className={`font-bold text-sm ${color}`}>{name}</p>
                  <p className="text-xs text-slate-500">{tagline}</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

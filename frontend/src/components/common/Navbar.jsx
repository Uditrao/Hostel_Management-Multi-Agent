/**
 * Navbar.jsx
 * ===========
 * Global top navigation bar present on all authenticated pages.
 *
 * Features:
 *   - Brand mark with link to role home
 *   - Backend health status badge (live-checks /health every 30s)
 *   - Current user's email + role badge
 *   - Logout button
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { checkHealth } from '../../services/api'
import { cn } from '../../lib/utils'

const ROLE_STYLES = {
  warden:     { badge: 'badge-violet',  label: 'Warden'     },
  mess_staff: { badge: 'badge-amber',   label: 'Mess Staff'  },
  student:    { badge: 'badge-cyan',    label: 'Student'     },
  kiosk:      { badge: 'badge-emerald', label: 'Kiosk'       },
}

export default function Navbar() {
  const { user, role, logout, getRoleHome } = useAuth()
  const navigate = useNavigate()
  const [backendOnline, setBackendOnline] = useState(null) // null = checking

  // Check backend health periodically
  useEffect(() => {
    let isMounted = true
    const check = async () => {
      try {
        await checkHealth()
        if (isMounted) setBackendOnline(true)
      } catch {
        if (isMounted) setBackendOnline(false)
      }
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => { isMounted = false; clearInterval(interval) }
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const roleInfo = ROLE_STYLES[role] ?? { badge: 'badge-slate', label: role ?? '—' }
  const email    = user?.email ?? '—'

  return (
    <header className="sticky top-0 z-50 glass-dark border-b border-white/[0.06]">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* Brand */}
        <Link
          to={getRoleHome()}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shadow-glow-violet">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="hidden sm:block font-bold text-slate-200 text-sm tracking-tight">
            Hostel<span className="text-violet-400">OS</span>
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-3">

          {/* Backend status */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
            {backendOnline === null ? (
              <span className="status-loading" />
            ) : backendOnline ? (
              <>
                <span className="status-online" />
                <span className="text-emerald-500">Backend</span>
              </>
            ) : (
              <>
                <span className="status-offline" />
                <span className="text-rose-400">Backend offline</span>
              </>
            )}
          </div>

          {/* Role badge */}
          <span className={cn('hidden sm:inline-flex', roleInfo.badge)}>
            {roleInfo.label}
          </span>

          {/* User email */}
          <span className="hidden md:block text-xs text-slate-500 max-w-[160px] truncate">
            {email}
          </span>

          {/* Logout */}
          <button
            onClick={handleLogout}
            id="nav-logout-btn"
            className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10
                       transition-all duration-200"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}

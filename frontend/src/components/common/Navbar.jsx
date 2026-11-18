/**
 * Navbar.jsx
 * ===========
 * Architectural Monochromatic Top Control Bar.
 * High-contrast, sharp grid alignment, custom logo mark.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { checkHealth } from '../../services/api'
import { cn } from '../../lib/utils'
import BrandLogo from './BrandLogo'

const ROLE_LABELS = {
  warden:     'WARDEN ADMIN',
  mess_staff: 'DINING OPS',
  student:    'RESIDENT',
  kiosk:      'TERMINAL',
}

export default function Navbar() {
  const { user, role, logout, getRoleHome } = useAuth()
  const navigate = useNavigate()
  const [backendOnline, setBackendOnline] = useState(null)

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

  const roleLabel = ROLE_LABELS[role] ?? (role ? role.toUpperCase() : 'USER')
  const email     = user?.email ?? '—'

  return (
    <header className="sticky top-0 z-50 bg-[#0c0c0c] border-b border-[#242424]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* Brand with distinctive CohavenOS logo */}
        <Link
          to={getRoleHome()}
          className="flex items-center gap-3 group"
        >
          <BrandLogo size={28} />
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-white text-sm tracking-widest font-mono uppercase">
              COHAVEN<span className="text-[#888888]">OS</span>
            </span>
            <span className="hidden sm:inline-block text-[10px] font-mono text-[#666666] tracking-tight">
              [FACILITY // v2.4]
            </span>
          </div>
        </Link>

        {/* Right Controls */}
        <div className="flex items-center gap-3">

          {/* Backend Status indicator */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#141414] border border-[#2b2b2b] text-[11px] font-mono">
            {backendOnline === null ? (
              <>
                <span className="w-1.5 h-1.5 bg-[#888888] animate-pulse" />
                <span className="text-[#888888]">POLLING API</span>
              </>
            ) : backendOnline ? (
              <>
                <span className="w-1.5 h-1.5 bg-[#ffffff]" />
                <span className="text-[#d0d0d0]">SYS ONLINE</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 bg-[#777777]" />
                <span className="text-[#888888]">STANDALONE</span>
              </>
            )}
          </div>

          {/* Role Badge */}
          <span className="hidden sm:inline-flex text-[10px] font-mono font-semibold px-2 py-0.5 bg-[#181818] border border-[#383838] text-white">
            {roleLabel}
          </span>

          {/* User Email */}
          <div className="hidden md:flex items-center text-[11px] text-[#999999] font-mono bg-[#111111] border border-[#262626] px-2.5 py-1 max-w-[200px] truncate">
            {email}
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            id="nav-logout-btn"
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono uppercase text-[#a0a0a0] hover:text-white bg-[#141414] hover:bg-[#202020] border border-[#2c2c2c] hover:border-[#666666] transition-all"
            title="Sign out of session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">EXIT</span>
          </button>
        </div>
      </div>
    </header>
  )
}

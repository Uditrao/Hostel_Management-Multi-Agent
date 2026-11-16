/**
 * UnauthorizedPage.jsx
 * ====================
 * Clean 403 Forbidden Access State with enterprise styling.
 */
import { Link } from 'react-router-dom'
import { ShieldAlert, ArrowLeft, LogIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function UnauthorizedPage() {
  const { getRoleHome, isAuthenticated } = useAuth()

  return (
    <div className="bg-[#0b0f17] min-h-screen flex items-center justify-center px-4 py-12">
      <div className="bg-[#141b2a] border border-white/[0.08] rounded-lg max-w-md w-full p-8 text-center shadow-card">
        
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-4 text-rose-400">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono uppercase bg-rose-500/10 border border-rose-500/25 text-rose-300 mb-3">
          Error 403 • Restricted Area
        </div>

        <h1 className="text-xl font-bold text-slate-100 mb-2">Access Denied</h1>
        <p className="text-slate-400 text-xs leading-relaxed mb-6">
          Your current account role does not possess the requisite clearance to access this module or operational endpoint.
        </p>

        {isAuthenticated ? (
          <Link
            to={getRoleHome()}
            id="unauthorized-go-home-btn"
            className="btn-primary w-full"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Authorized Portal
          </Link>
        ) : (
          <Link
            to="/login"
            id="unauthorized-login-btn"
            className="btn-primary w-full"
          >
            <LogIn className="w-4 h-4" />
            Sign In with Required Credentials
          </Link>
        )}
      </div>
    </div>
  )
}

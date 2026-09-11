/**
 * UnauthorizedPage.jsx
 * Clean 403 Access Denied with return-to-portal button.
 */
import { Link } from 'react-router-dom'
import { ShieldOff, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function UnauthorizedPage() {
  const { getRoleHome, isAuthenticated } = useAuth()

  return (
    <div className="bg-hostel min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full text-center animate-fade-in">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-5">
          <ShieldOff className="w-10 h-10 text-rose-400" />
        </div>

        <div className="badge badge-rose mx-auto mb-3">403 Forbidden</div>

        <h1 className="text-2xl font-bold text-slate-100 mb-3">Access Denied</h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-xs mx-auto">
          You don't have permission to view this page.
          This area is restricted to a specific role.
        </p>

        {isAuthenticated ? (
          <Link
            to={getRoleHome()}
            id="unauthorized-go-home-btn"
            className="btn-secondary inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to My Portal
          </Link>
        ) : (
          <Link
            to="/login"
            id="unauthorized-login-btn"
            className="btn-primary inline-flex items-center gap-2"
          >
            Sign In
          </Link>
        )}
      </div>
    </div>
  )
}

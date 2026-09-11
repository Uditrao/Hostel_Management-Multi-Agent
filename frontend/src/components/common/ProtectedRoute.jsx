/**
 * ProtectedRoute.jsx
 * ==================
 * Role-based route guard. Wraps React Router <Outlet />.
 *
 * Props:
 *   allowedRoles  : string[]  — e.g. ['student'], ['warden'], ['mess_staff']
 *                   If empty / not provided, only checks authentication.
 *
 * Behaviour:
 *   loading           → full-page spinner (waiting for Supabase session)
 *   !isAuthenticated  → redirect to /login?redirect=<current path>
 *   role not allowed  → redirect to /unauthorized
 *   OK                → renders <Outlet />
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { FullPageSpinner } from './LoadingSpinner'

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { isAuthenticated, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <FullPageSpinner message="Verifying session…" />
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    )
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}

/**
 * WardenLayout.jsx
 * Layout shell for the Warden / Admin Portal (/warden/*).
 * Violet-accented sidebar + top tabs hybrid for larger dashboards.
 */
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, Wrench, AlertTriangle, UserCheck
} from 'lucide-react'
import { cn } from '../../lib/utils'

const tabs = [
  { to: '/warden/dashboard',   icon: LayoutDashboard, label: 'Dashboard'     },
  { to: '/warden/defaulters',  icon: Users,            label: 'Defaulters'    },
  { to: '/warden/complaints',  icon: Wrench,           label: 'Complaints'    },
  { to: '/warden/anomalies',   icon: AlertTriangle,    label: 'HERALD Flags'  },
  { to: '/warden/approvals',   icon: UserCheck,        label: 'Approvals'     },
]

export default function WardenLayout() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Tab bar */}
      <nav className="glass-dark border-b border-white/[0.06] px-4 sm:px-6">
        <div className="max-w-screen-xl mx-auto flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              id={`warden-tab-${label.toLowerCase().replace(/\s/g, '-')}`}
              className={({ isActive }) =>
                cn('nav-tab whitespace-nowrap', isActive && 'nav-tab-active text-violet-400')
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Page content */}
      <div className="flex-1 max-w-screen-xl w-full mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </div>
    </div>
  )
}

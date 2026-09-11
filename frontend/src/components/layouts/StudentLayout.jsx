/**
 * StudentLayout.jsx
 * Layout shell for the Student Portal (/student/*).
 * Renders a horizontal tab navigation bar + content area.
 * Each tab is a placeholder ready for Phase 7B components.
 */
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Camera, CalendarCheck, Wrench } from 'lucide-react'
import { cn } from '../../lib/utils'

const tabs = [
  { to: '/student/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/student/enroll',      icon: Camera,           label: 'Face Enroll' },
  { to: '/student/attendance',  icon: CalendarCheck,    label: 'Attendance'  },
  { to: '/student/complaints',  icon: Wrench,           label: 'Complaints'  },
]

export default function StudentLayout() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Tab bar */}
      <nav className="glass-dark border-b border-white/[0.06] px-4 sm:px-6">
        <div className="max-w-screen-xl mx-auto flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              id={`student-tab-${label.toLowerCase().replace(/\s/g, '-')}`}
              className={({ isActive }) =>
                cn('nav-tab whitespace-nowrap', isActive && 'nav-tab-active text-cyan-400')
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

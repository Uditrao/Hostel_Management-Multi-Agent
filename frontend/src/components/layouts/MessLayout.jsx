/**
 * MessLayout.jsx
 * Layout shell for the Mess Staff Portal (/mess/*).
 * Amber-accented tabs for all NOURISH agent features.
 */
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Package, BookOpen, Terminal } from 'lucide-react'
import { cn } from '../../lib/utils'

const tabs = [
  { to: '/mess/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/mess/inventory',   icon: Package,          label: 'Inventory'   },
  { to: '/mess/menu',        icon: BookOpen,         label: 'Menu Upload' },
  { to: '/mess/command',     icon: Terminal,         label: 'NLP Command' },
]

export default function MessLayout() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Tab bar */}
      <nav className="glass-dark border-b border-white/[0.06] px-4 sm:px-6">
        <div className="max-w-screen-xl mx-auto flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              id={`mess-tab-${label.toLowerCase().replace(/\s/g, '-')}`}
              className={({ isActive }) =>
                cn('nav-tab whitespace-nowrap', isActive && 'nav-tab-active text-amber-400')
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

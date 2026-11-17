/**
 * MessLayout.jsx
 * ==============
 * Monochromatic architectural subnav for Dining Operations portal.
 */
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Camera, Package, BookOpen, Terminal } from 'lucide-react'
import { cn } from '../../lib/utils'

const tabs = [
  { to: '/mess/dashboard',   icon: LayoutDashboard, label: 'KITCHEN OPS' },
  { to: '/mess/kiosk',       icon: Camera,          label: 'DINING TERMINAL' },
  { to: '/mess/inventory',   icon: Package,          label: 'STOCK REGISTRY' },
  { to: '/mess/menu',        icon: BookOpen,         label: 'MENU PARSER' },
  { to: '/mess/command',     icon: Terminal,         label: 'NLP AUDIT' },
]

export default function MessLayout() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)] bg-[#080808]">
      {/* Sub-navigation bar */}
      <nav className="bg-[#0e0e0e] border-b border-[#222222] px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              id={`mess-tab-${label.toLowerCase().replace(/\s/g, '-')}`}
              className={({ isActive }) =>
                cn(
                  'nav-tab whitespace-nowrap',
                  isActive
                    ? 'nav-tab-active'
                    : 'text-[#888888] hover:text-white'
                )
              }
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}

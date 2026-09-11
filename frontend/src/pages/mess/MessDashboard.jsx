/**
 * MessDashboard.jsx
 * Mess staff portal landing — Phase 7A shell.
 */
import { Package, AlertTriangle, Utensils, Terminal } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const placeholders = [
  { icon: Package,       label: 'Total Stock Items', value: '—', sub: 'tracked items',   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20'  },
  { icon: AlertTriangle, label: 'Active Alerts',     value: '—', sub: 'low stock',       color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/20'   },
  { icon: Utensils,      label: "Today's Entries",   value: '—', sub: 'mess entries',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { icon: Terminal,      label: 'NLP Commands',      value: '—', sub: 'this week',       color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/20'   },
]

export default function MessDashboard() {
  const { user } = useAuth()
  const name = user?.user_metadata?.full_name ?? 'Mess Staff'

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <p className="text-xs text-amber-500 font-semibold uppercase tracking-widest mb-1">Mess Staff Portal</p>
        <h2 className="page-header">Good day, {name} 🍽️</h2>
        <p className="page-subheader">NOURISH agent — inventory, menu, and entry management.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {placeholders.map(({ icon: Icon, label, value, sub, color, bg }) => (
          <div key={label} className={`stat-card border ${bg}`}>
            <div className={`w-9 h-9 rounded-xl ${bg} border flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-200">{value}</p>
              <p className="text-xs font-medium text-slate-400">{label}</p>
              <p className="text-xs text-slate-600">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card border border-amber-500/15 text-center py-10">
        <p className="text-slate-500 text-sm">
          🥘 Full mess features are coming in <span className="text-amber-400 font-semibold">Phase 7C</span>.
        </p>
        <p className="text-slate-600 text-xs mt-1">
          Live inventory, menu upload, and NLP command bar will appear here.
        </p>
      </div>
    </div>
  )
}

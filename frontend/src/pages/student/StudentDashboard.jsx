/**
 * StudentDashboard.jsx
 * Student portal landing — Phase 7A shell.
 * Shows welcome card + placeholder stat cards for Phase 7B.
 */
import { CalendarCheck, Wrench, Camera, Clock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const placeholders = [
  { icon: CalendarCheck, label: 'Attendance',      value: '—',  sub: 'last 30 days',   color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/20'    },
  { icon: Wrench,        label: 'Open Complaints',  value: '—',  sub: 'active tickets', color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/20'    },
  { icon: Camera,        label: 'Face Status',      value: '—',  sub: 'enrollment',     color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/20' },
  { icon: Clock,         label: 'Last Seen',        value: '—',  sub: 'at gate',        color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
]

export default function StudentDashboard() {
  const { user } = useAuth()
  const name = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Student'

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-cyan-500 font-semibold uppercase tracking-widest mb-1">Student Portal</p>
        <h2 className="page-header">Welcome back, {name} 👋</h2>
        <p className="page-subheader">Here's a summary of your hostel activity.</p>
      </div>

      {/* Stat cards */}
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

      {/* Coming-soon notice */}
      <div className="card border border-cyan-500/15 text-center py-10">
        <p className="text-slate-500 text-sm">
          📡 Full student features are coming in <span className="text-cyan-400 font-semibold">Phase 7B</span>.
        </p>
        <p className="text-slate-600 text-xs mt-1">
          Attendance history, face enrollment, and complaint submission will appear here.
        </p>
      </div>
    </div>
  )
}

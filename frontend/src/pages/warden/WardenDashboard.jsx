/**
 * WardenDashboard.jsx
 * Warden / Admin portal landing — Phase 7A shell.
 * Shows overview stat placeholders and system agent health overview.
 */
import {
  Users,
  AlertTriangle,
  Wrench,
  ShieldCheck,
  Activity,
  Eye,
  UtensilsCrossed,
  Cpu
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const statCards = [
  { icon: Users,         label: 'Enrolled Students', value: '—', sub: 'active profiles',   color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/20' },
  { icon: AlertTriangle, label: "Today's Defaulters", value: '—', sub: 'gate curfew missed', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20'   },
  { icon: Wrench,        label: 'Open Complaints',   value: '—', sub: 'requiring action',  color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/20'    },
  { icon: ShieldCheck,   label: 'HERALD Anomalies',  value: '—', sub: 'unread flags',      color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/20'    },
]

const agents = [
  { name: 'IRIS',     role: 'Vision Agent',         icon: Eye,             desc: 'Face recognition & kiosk event dispatch', status: 'Active' },
  { name: 'SENTINEL', role: 'Attendance Agent',     icon: Activity,        desc: 'Gate verification & defaulter detection',  status: 'Active' },
  { name: 'NOURISH',  role: 'Mess Management Agent',icon: UtensilsCrossed, desc: 'Entry gating, inventory & menu parsing', status: 'Active' },
  { name: 'FIXR',     role: 'Maintenance Agent',    icon: Wrench,          desc: 'Complaint triage via Groq LLM',          status: 'Active' },
  { name: 'HERALD',   role: 'Orchestrator Agent',   icon: Cpu,             desc: 'Multi-agent anomaly correlation engine', status: 'Active' },
]

export default function WardenDashboard() {
  const { user } = useAuth()
  const name = user?.user_metadata?.full_name ?? 'Hostel Warden'

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs text-violet-400 font-semibold uppercase tracking-widest mb-1">
          Administration Portal
        </p>
        <h1 className="page-header">Welcome, {name} 🏛️</h1>
        <p className="page-subheader">
          Cross-agent operational oversight, safety flags, and hostel management.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ icon: Icon, label, value, sub, color, bg }) => (
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

      {/* Multi-Agent System Status Grid */}
      <div className="card border border-white/[0.08] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-200">System Multi-Agent Grid</h2>
            <p className="text-xs text-slate-400">Integrated autonomous agents status overview</p>
          </div>
          <span className="badge badge-emerald flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Orchestrator Armed
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(({ name: aName, role: aRole, icon: AIcon, desc: aDesc, status: aStatus }) => (
            <div
              key={aName}
              className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-violet-500/30 transition-all flex flex-col justify-between"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                    <AIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">{aName}</h3>
                    <p className="text-[11px] text-slate-400">{aRole}</p>
                  </div>
                </div>
                <span className="badge badge-cyan text-[10px] py-0.5">{aStatus}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">{aDesc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Coming-soon Notice for Phase 7D */}
      <div className="card border border-violet-500/20 text-center py-10">
        <p className="text-slate-400 text-sm">
          🛡️ Full Warden interactive management tables & live HERALD anomaly stream arrive in{' '}
          <span className="text-violet-400 font-semibold">Phase 7D</span>.
        </p>
        <p className="text-slate-500 text-xs mt-1">
          Defaulters list, complaint assignment, live anomaly review, and student approval actions will be wired directly.
        </p>
      </div>
    </div>
  )
}

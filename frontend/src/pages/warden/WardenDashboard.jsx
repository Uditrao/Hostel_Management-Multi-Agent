/**
 * WardenDashboard.jsx — Phase 7D
 * ================================
 * Live operational overview fetching real stats from SENTINEL, FIXR, HERALD,
 * and the Auth approval queue. Replaces the static placeholder version.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, AlertTriangle, Wrench, ShieldCheck,
  Activity, Eye, UtensilsCrossed, Cpu,
  RefreshCw, ArrowRight, UserCheck, Clock,
  CheckCircle2, XCircle, Zap, DoorOpen
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { wardenApi, sentinelApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const agents = [
  { name: 'IRIS',     role: 'Vision Agent',          icon: Eye,             desc: 'Face recognition & kiosk event dispatch' },
  { name: 'SENTINEL', role: 'Attendance Agent',      icon: Activity,        desc: 'Gate verification & defaulter detection' },
  { name: 'NOURISH',  role: 'Mess Management Agent', icon: UtensilsCrossed, desc: 'Entry gating, inventory & menu parsing' },
  { name: 'FIXR',     role: 'Maintenance Agent',     icon: Wrench,          desc: 'Complaint triage via Groq LLM' },
  { name: 'HERALD',   role: 'Orchestrator Agent',    icon: Cpu,             desc: 'Multi-agent anomaly correlation engine' },
]

export default function WardenDashboard() {
  const { user } = useAuth()
  const name = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Warden'

  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState({
    defaultersToday:  null,
    pendingApprovals: null,
    openComplaints:   null,
    criticalComplaints: null,
    unseenAnomalies:  null,
    gateWindow:       null,
  })
  const [heraldSummary, setHeraldSummary] = useState(null)
  const [recentAnomalies, setRecentAnomalies] = useState([])
  const [recentComplaints, setRecentComplaints] = useState([])

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [
        defaultersRes,
        pendingRes,
        complaintsSummaryRes,
        anomaliesRes,
        recentComplaintsRes,
        windowRes,
        heraldSummaryRes,
      ] = await Promise.all([
        wardenApi.getDefaulters().catch(() => ({ data: null })),
        wardenApi.getPendingStudents().catch(() => ({ data: null })),
        wardenApi.getFixrSummary().catch(() => ({ data: null })),
        wardenApi.getAnomalies({ unseenOnly: true, limit: 5 }).catch(() => ({ data: null })),
        wardenApi.getComplaints({ status: 'open', urgency: 'critical', limit: 3 }).catch(() => ({ data: null })),
        sentinelApi.getWindow().catch(() => ({ data: null })),
        wardenApi.getHeraldSummary(true).catch(() => ({ data: null })),
      ])

      setStats({
        defaultersToday:    defaultersRes.data?.defaulters?.length ?? null,
        pendingApprovals:   pendingRes.data?.count ?? null,
        openComplaints:     complaintsSummaryRes.data?.open ?? null,
        criticalComplaints: complaintsSummaryRes.data?.high_critical_open ?? null,
        unseenAnomalies:    anomaliesRes.data?.total ?? null,
        gateWindow:         windowRes.data ?? null,
      })
      setRecentAnomalies(anomaliesRes.data?.flags?.slice(0, 4) ?? [])
      setRecentComplaints(recentComplaintsRes.data?.complaints?.slice(0, 3) ?? [])
      setHeraldSummary(heraldSummaryRes.data?.summary ?? null)
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData(false) }, [loadData])

  const handleRunHerald = async () => {
    setRefreshing(true)
    try {
      await wardenApi.runHerald()
      await loadData(true)
    } catch {
      setRefreshing(false)
    }
  }

  const urgencyColor = (u) => ({
    critical: 'badge-rose',
    high:     'badge-amber',
    medium:   'badge-violet',
    low:      'badge-slate',
  }[u] ?? 'badge-slate')

  const flagTypeLabel = (t) => ({
    attendance_missed:    'Attendance Missed',
    mess_missed_streak:   'Mess Streak',
    unresolved_complaint: 'Open Complaint',
  }[t] ?? t)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-violet-400 font-semibold uppercase tracking-widest mb-1">
            Administration Portal
          </p>
          <h1 className="page-header">Welcome, {name}</h1>
          <p className="page-subheader">
            Cross-agent operational oversight — all 5 agents reporting live.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Link
            to="/warden/kiosk"
            className="btn-primary flex items-center gap-2 text-sm bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-glow-cyan"
          >
            <DoorOpen className="w-4 h-4" />
            Open Gate Scanner
          </Link>
          <button
            onClick={handleRunHerald}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {refreshing
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Zap className="w-4 h-4" />
            }
            Run HERALD
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Defaulters */}
        <Link to="/warden/defaulters" className="stat-card border bg-amber-500/10 border-amber-500/20 hover:border-amber-400/40 transition-all group">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-200">
              {stats.defaultersToday ?? '—'}
            </p>
            <p className="text-xs font-medium text-slate-400">Today's Defaulters</p>
            <p className="text-xs text-slate-600">missed gate curfew</p>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-400/0 group-hover:text-amber-400/80 transition-all absolute top-4 right-4" />
        </Link>

        {/* Pending Approvals */}
        <Link to="/warden/approvals" className="stat-card border bg-cyan-500/10 border-cyan-500/20 hover:border-cyan-400/40 transition-all group">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <UserCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-200">
              {stats.pendingApprovals ?? '—'}
            </p>
            <p className="text-xs font-medium text-slate-400">Pending Approvals</p>
            <p className="text-xs text-slate-600">awaiting warden action</p>
          </div>
          <ArrowRight className="w-4 h-4 text-cyan-400/0 group-hover:text-cyan-400/80 transition-all absolute top-4 right-4" />
        </Link>

        {/* Open Complaints */}
        <Link to="/warden/complaints" className="stat-card border bg-rose-500/10 border-rose-500/20 hover:border-rose-400/40 transition-all group">
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <Wrench className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-200">
              {stats.openComplaints ?? '—'}
            </p>
            <p className="text-xs font-medium text-slate-400">Open Complaints</p>
            <p className="text-xs text-rose-400/80">
              {stats.criticalComplaints ? `${stats.criticalComplaints} critical/high` : 'requiring action'}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-rose-400/0 group-hover:text-rose-400/80 transition-all absolute top-4 right-4" />
        </Link>

        {/* HERALD Anomalies */}
        <Link to="/warden/anomalies" className="stat-card border bg-violet-500/10 border-violet-500/20 hover:border-violet-400/40 transition-all group">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-200">
              {stats.unseenAnomalies ?? '—'}
            </p>
            <p className="text-xs font-medium text-slate-400">Unread Anomalies</p>
            <p className="text-xs text-slate-600">HERALD flags</p>
          </div>
          {stats.unseenAnomalies > 0 && (
            <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-violet-400 rounded-full animate-pulse" />
          )}
          <ArrowRight className="w-4 h-4 text-violet-400/0 group-hover:text-violet-400/80 transition-all absolute top-4 right-4" />
        </Link>
      </div>

      {/* Gate Window + HERALD Summary row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gate Attendance Window */}
        <div className="card border border-white/[0.08] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-slate-200">Gate Attendance Window</h2>
          </div>
          {stats.gateWindow ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Window</span>
                <span className="text-sm font-mono text-slate-200">
                  {stats.gateWindow.start_time?.slice(0,5)} – {stats.gateWindow.end_time?.slice(0,5)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Active Days</span>
                <span className="text-xs text-slate-300">
                  {stats.gateWindow.active_days?.join(', ')}
                </span>
              </div>
              <Link to="/warden/defaulters" className="mt-3 text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                Manage window <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No window configured</p>
          )}
        </div>

        {/* HERALD AI Summary */}
        <div className="card border border-violet-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-slate-200">HERALD Briefing</h2>
            <span className="badge badge-violet text-[10px] ml-auto">AI Summary</span>
          </div>
          {heraldSummary ? (
            <p className="text-xs text-slate-300 leading-relaxed">{heraldSummary}</p>
          ) : (
            <p className="text-xs text-slate-500 italic">
              No unread anomalies — system is operating normally. Run HERALD for a fresh scan.
            </p>
          )}
        </div>
      </div>

      {/* Recent Anomalies + Critical Complaints row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent HERALD flags */}
        <div className="card border border-white/[0.08] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-200">Recent Anomalies</h2>
            </div>
            <Link to="/warden/anomalies" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentAnomalies.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <p className="text-xs">No unread anomalies. All clear.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentAnomalies.map((flag) => (
                <div key={flag.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <span className={`badge text-[10px] shrink-0 mt-0.5 ${
                    flag.type === 'unresolved_complaint' ? 'badge-rose' :
                    flag.type === 'attendance_missed'    ? 'badge-amber' : 'badge-violet'
                  }`}>
                    {flagTypeLabel(flag.type)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-300 truncate">
                      {flag.student?.name ?? flag.detail ?? '—'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {flag.student?.roll_no ?? ''}{flag.student?.room_no ? ` · Room ${flag.student.room_no}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Critical Complaints */}
        <div className="card border border-white/[0.08] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-rose-400" />
              <h2 className="text-sm font-semibold text-slate-200">Critical Complaints</h2>
            </div>
            <Link to="/warden/complaints" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentComplaints.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <p className="text-xs">No critical complaints open.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentComplaints.map((c) => (
                <div key={c.id} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge text-[10px] ${urgencyColor(c.urgency)}`}>{c.urgency}</span>
                    <span className="badge badge-slate text-[10px]">{c.category}</span>
                  </div>
                  <p className="text-xs text-slate-300 truncate">{c.short_summary || c.raw_text}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {c.student?.name ?? c.student_id?.slice(0, 8)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Grid */}
      <div className="card border border-white/[0.08] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-200">System Multi-Agent Grid</h2>
            <p className="text-xs text-slate-400">Integrated autonomous agents status overview</p>
          </div>
          <span className="badge badge-emerald flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Orchestrator Armed
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(({ name: aName, role: aRole, icon: AIcon, desc: aDesc }) => (
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
                <span className="badge badge-emerald text-[10px] py-0.5">Active</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">{aDesc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

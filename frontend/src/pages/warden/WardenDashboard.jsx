/**
 * WardenDashboard.jsx — Architectural Monochromatic Command Overview
 * =================================================================
 * Executive facility command station built with pure high-contrast monochrome
 * aesthetics: deep black, dark charcoal, slate grey, off-white and razor-sharp borders.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, AlertTriangle, Wrench, ShieldCheck,
  Activity, Eye, UtensilsCrossed, Cpu,
  RefreshCw, ArrowRight, UserCheck, Clock,
  CheckCircle2, XCircle, Zap, DoorOpen, Settings
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { wardenApi, sentinelApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import AttendanceWindowModal from '../../components/warden/AttendanceWindowModal'

const AGENTS = [
  { name: 'IRIS',     role: 'Vision Agent',          desc: 'MobileFaceNet 512-d biometric recognition & kiosk event dispatch', status: 'ONLINE' },
  { name: 'SENTINEL', role: 'Curfew & Gate Agent',    desc: 'Gate compliance verification, automated timestamping & curfew enforcement', status: 'ACTIVE' },
  { name: 'NOURISH',  role: 'Dining Logistics Agent',desc: 'Dining entry gating, real-time inventory tracking & PDF menu parser', status: 'ONLINE' },
  { name: 'FIXR',     role: 'Maintenance Agent',     desc: 'Automated ticket categorization & urgency triage via Groq LLM', status: 'ACTIVE' },
  { name: 'HERALD',   role: 'Orchestrator Agent',    desc: 'Cross-agent anomaly heuristic correlation & warden morning briefing', status: 'ARMED' },
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
  const [windowModalOpen, setWindowModalOpen] = useState(false)

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
      // keep state
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

  const flagTypeLabel = (t) => ({
    attendance_missed:    'GATE DEFICIT',
    mess_missed_streak:   'DINING STREAK',
    unresolved_complaint: 'STALLED TICKET',
  }[t] ?? t.toUpperCase())

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6 font-mono text-[#e0e0e0]">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#242424]">
        <div>
          <div className="flex items-center gap-2 mb-1 text-[11px] text-[#777777] uppercase tracking-wider">
            <span>ADMINISTRATION CONSOLE</span>
            <span>//</span>
            <span>NODE-01</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-sans uppercase">
            FACILITY COMMAND OVERVIEW
          </h1>
          <p className="text-xs text-[#888888] font-sans mt-0.5">
            Operational telemetry reporting from all active multi-agent subsystems.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/warden/kiosk"
            className="btn-primary text-xs"
          >
            <DoorOpen className="w-3.5 h-3.5" />
            GATE TERMINAL
          </Link>
          <button
            onClick={handleRunHerald}
            disabled={refreshing}
            className="btn-secondary text-xs"
          >
            {refreshing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            RUN HERALD AUDIT
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn-ghost text-xs"
            title="Refresh current metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Metric Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Defaulters */}
        <Link
          to="/warden/defaulters"
          className="bg-[#0e0e0e] border border-[#242424] hover:border-[#666666] p-5 flex flex-col justify-between group transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#777777] uppercase tracking-wider">CURFEW DEFAULTERS</span>
            <Users className="w-4 h-4 text-[#777777] group-hover:text-white transition-colors" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-white">
              {stats.defaultersToday ?? '0'}
            </div>
            <p className="text-[10px] text-[#777777] uppercase mt-0.5 font-sans">Flagged late/absent</p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#666666] pt-2 border-t border-[#1a1a1a]">
            <span>VIEW DEFAULTERS</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Pending Approvals */}
        <Link
          to="/warden/approvals"
          className="bg-[#0e0e0e] border border-[#242424] hover:border-[#666666] p-5 flex flex-col justify-between group transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#777777] uppercase tracking-wider">VERIFICATION QUEUE</span>
            <UserCheck className="w-4 h-4 text-[#777777] group-hover:text-white transition-colors" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-white">
              {stats.pendingApprovals ?? '0'}
            </div>
            <p className="text-[10px] text-[#777777] uppercase mt-0.5 font-sans">Awaiting room assign</p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#666666] pt-2 border-t border-[#1a1a1a]">
            <span>AUTHORIZE RESIDENTS</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Maintenance Complaints */}
        <Link
          to="/warden/complaints"
          className="bg-[#0e0e0e] border border-[#242424] hover:border-[#666666] p-5 flex flex-col justify-between group transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#777777] uppercase tracking-wider">OPEN COMPLAINTS</span>
            <Wrench className="w-4 h-4 text-[#777777] group-hover:text-white transition-colors" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-white">
              {stats.openComplaints ?? '0'}
            </div>
            <p className="text-[10px] text-[#777777] uppercase mt-0.5 font-sans">
              {stats.criticalComplaints ? `${stats.criticalComplaints} CRITICAL SEVERITY` : 'Facility tickets'}
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#666666] pt-2 border-t border-[#1a1a1a]">
            <span>MANAGE QUEUE</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* HERALD Flags */}
        <Link
          to="/warden/anomalies"
          className="bg-[#0e0e0e] border border-[#242424] hover:border-[#666666] p-5 flex flex-col justify-between group transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#777777] uppercase tracking-wider">ANOMALY FLAGS</span>
            <ShieldCheck className="w-4 h-4 text-[#777777] group-hover:text-white transition-colors" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-white flex items-center gap-2">
              {stats.unseenAnomalies ?? '0'}
              {stats.unseenAnomalies > 0 && (
                <span className="w-2 h-2 bg-white" />
              )}
            </div>
            <p className="text-[10px] text-[#777777] uppercase mt-0.5 font-sans">Unread HERALD sweeps</p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#666666] pt-2 border-t border-[#1a1a1a]">
            <span>INCIDENT LOG</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* ── Operational Briefing & Curfew Parameters ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Curfew Parameters Card */}
        <div className="bg-[#0e0e0e] border border-[#242424] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#202020] mb-3">
              <div className="flex items-center gap-2 text-xs text-white">
                <Clock className="w-4 h-4 text-[#888888]" />
                <span className="tracking-wider uppercase">CURFEW WINDOW ENGINE</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 bg-[#181818] border border-[#333333] text-[#aaaaaa]">
                SENTINEL
              </span>
            </div>

            {stats.gateWindow ? (
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-[#131313] border border-[#222222] flex items-center justify-between">
                  <span className="text-[#888888]">GATE HOURS</span>
                  <span className="font-bold text-white">
                    {stats.gateWindow.start_time?.slice(0,5)} — {stats.gateWindow.end_time?.slice(0,5)}
                  </span>
                </div>
                <div className="p-3 bg-[#131313] border border-[#222222] flex items-center justify-between">
                  <span className="text-[#888888]">SCHEDULE</span>
                  <span className="text-[#cccccc]">
                    {stats.gateWindow.active_days?.join(', ') || 'MON-SUN'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setWindowModalOpen(true)}
                  className="w-full mt-2 py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>CONFIGURE CURFEW TIMINGS</span>
                </button>
              </div>
            ) : (
              <div className="py-2">
                <p className="text-xs text-[#666666] italic mb-2">Window configuration offline.</p>
                <button
                  type="button"
                  onClick={() => setWindowModalOpen(true)}
                  className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>SET CURFEW TIMINGS</span>
                </button>
              </div>
            )}
          </div>

          <Link
            to="/warden/defaulters"
            className="mt-4 pt-3 border-t border-[#1a1a1a] text-xs text-[#888888] hover:text-white flex items-center justify-between"
          >
            <span>AUDIT CURFEW DEFAULTERS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* HERALD Autonomous Summary */}
        <div className="lg:col-span-2 bg-[#0e0e0e] border border-[#242424] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#202020] mb-3">
              <div className="flex items-center gap-2 text-xs text-white">
                <Cpu className="w-4 h-4 text-[#888888]" />
                <span className="tracking-wider uppercase">HERALD INTELLIGENCE DIGEST</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 bg-[#181818] border border-[#333333] text-[#aaaaaa]">
                CROSS-AGENT ORCHESTRATOR
              </span>
            </div>

            <div className="p-4 bg-[#111111] border border-[#222222] min-h-[90px] flex items-center font-sans">
              {heraldSummary ? (
                <p className="text-xs text-[#cccccc] leading-relaxed">
                  {heraldSummary}
                </p>
              ) : (
                <div className="flex items-center gap-2 text-[#777777] text-xs font-mono">
                  <span className="w-2 h-2 bg-white" />
                  <span>ALL FACILITY LOGS CLEAR. ZERO IRREGULARITIES REPORTED BY SUB-AGENTS.</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center justify-between text-xs text-[#666666]">
            <span>NEXT SCHEDULED SWEEP: 23:59:00</span>
            <Link to="/warden/anomalies" className="text-[#999999] hover:text-white flex items-center gap-1">
              <span>EXPLORE ALL FLAGS</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Split Table Feeds: Recent Anomalies & Critical Complaints ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Anomalies Panel */}
        <div className="bg-[#0e0e0e] border border-[#242424] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#202020] mb-3">
            <span className="text-xs font-bold text-white tracking-wider uppercase">FLAGGED EXCEPTIONS</span>
            <Link to="/warden/anomalies" className="text-xs text-[#888888] hover:text-white flex items-center gap-1">
              <span>ALL</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentAnomalies.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#555555]">
              No unhandled exception flags on file.
            </div>
          ) : (
            <div className="space-y-2">
              {recentAnomalies.map((flag) => {
                const raw = flag.student || (Array.isArray(flag.students) ? flag.students[0] : flag.students)
                let name = raw?.name
                let roll = raw?.roll_no
                let room = raw?.room_no
                if ((!name || name.toLowerCase() === 'unknown' || name.toLowerCase() === 'unregistered entity') && flag.detail) {
                  const match = flag.detail.match(/(?:by\s+)?([A-Za-z0-9\s]+?)\s*\(Roll:\s*([^,\)]+)(?:,\s*Room:\s*([^,\)]+))?\)/i)
                  if (match) {
                    name = match[1].replace(/^(?:CRITICAL|HIGH|MEDIUM|LOW)\s+\w+\s+complaint\s+by\s+/i, '').trim()
                    if (!roll) roll = match[2]?.trim()
                    if (!room) room = match[3]?.trim()
                  }
                }
                const displayName = name || 'Hostel Resident'
                const displaySub = roll ? `${roll} • ROOM ${room || '—'}` : (flag.detail || 'Exception flag logged')

                return (
                  <div
                    key={flag.id}
                    className="p-3 bg-[#121212] border border-[#222222] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="text-white font-sans font-medium truncate">
                        {displayName}
                      </p>
                      <p className="text-[11px] text-[#777777] mt-0.5 truncate">
                        {displaySub}
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-[#1c1c1c] border border-[#333333] text-white shrink-0">
                      {flagTypeLabel(flag.type)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Critical Maintenance Tickets */}
        <div className="bg-[#0e0e0e] border border-[#242424] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#202020] mb-3">
            <span className="text-xs font-bold text-white tracking-wider uppercase">HIGH-PRIORITY TICKETS</span>
            <Link to="/warden/complaints" className="text-xs text-[#888888] hover:text-white flex items-center gap-1">
              <span>ALL</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentComplaints.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#555555]">
              No critical or high-urgency work orders open.
            </div>
          ) : (
            <div className="space-y-2">
              {recentComplaints.map((c) => (
                <div
                  key={c.id}
                  className="p-3 bg-[#121212] border border-[#222222] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="text-white font-sans font-medium truncate">
                      {c.short_summary || c.raw_text}
                    </p>
                    <p className="text-[11px] text-[#777777] mt-0.5">
                      {c.student?.name || 'RESIDENT'} • ROOM {c.student?.room_no || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 bg-[#1f1414] border border-[#522929] text-[#e49191] uppercase">
                      {c.urgency}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-[#1c1c1c] border border-[#333333] text-[#aaaaaa] uppercase">
                      {c.category}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Multi-Agent Infrastructure Grid ─────────────────────────────────── */}
      <div className="bg-[#0e0e0e] border border-[#242424] p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#202020] mb-4">
          <div>
            <h2 className="text-xs font-bold text-white tracking-wider uppercase">AUTONOMOUS AGENT CLUSTERS</h2>
            <p className="text-[11px] text-[#777777] font-sans">Distributed AI micro-services status register</p>
          </div>
          <span className="text-[10px] text-white bg-[#1a1a1a] border border-[#333333] px-2 py-0.5">
            5 NODES HEALTHY
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {AGENTS.map(({ name: aName, role: aRole, desc: aDesc, status: aStatus }) => (
            <div
              key={aName}
              className="p-3 bg-[#111111] border border-[#222222] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-white tracking-wider">
                    {aName}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 bg-[#1a1a1a] text-white border border-[#333333]">
                    {aStatus}
                  </span>
                </div>
                <p className="text-[11px] text-[#aaaaaa] font-sans font-medium">{aRole}</p>
                <p className="text-[10px] text-[#666666] font-sans mt-1 leading-relaxed line-clamp-2">{aDesc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AttendanceWindowModal
        isOpen={windowModalOpen}
        onClose={() => setWindowModalOpen(false)}
        initialWindow={stats.gateWindow}
        onSaved={(newWin) => {
          setStats((prev) => ({ ...prev, gateWindow: newWin }))
        }}
      />
    </div>
  )
}

/**
 * StudentDashboard.jsx
 * ====================
 * Comprehensive Student Mission Control Dashboard.
 * Integrates live metrics across IRIS, SENTINEL, and FIXR.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarCheck,
  Wrench,
  Camera,
  Clock,
  AlertTriangle,
  ArrowRight,
  Eye,
  RefreshCw,
  Hash,
  Home
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { sentinelApi, fixrApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function StudentDashboard() {
  const { user, profile, studentProfile, refreshProfile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [attendanceStats, setAttendanceStats] = useState({
    rate: 100,
    present: 0,
    late: 0,
    total: 0,
    recentLogs: [],
  })
  const [complaintStats, setComplaintStats] = useState({
    openCount: 0,
    activeTickets: [],
  })
  const [gateWindow, setGateWindow] = useState(null)

  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!user?.id) return
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      // Parallel fetch across agents
      const [attRes, compRes, winRes] = await Promise.all([
        sentinelApi.getAttendance(user.id, 5).catch(() => ({ data: null })),
        fixrApi.getMyComplaints(user.id, null, 4).catch(() => ({ data: null })),
        sentinelApi.getWindow().catch(() => ({ data: null })),
      ])

      // Attendance
      if (attRes.data?.success) {
        const d = attRes.data
        const tot = d.total_records || 0
        const pres = d.present_count || 0
        setAttendanceStats({
          rate: tot > 0 ? Math.round((pres / tot) * 100) : 100,
          present: pres,
          late: d.late_count || 0,
          total: tot,
          recentLogs: d.logs || [],
        })
      }

      // Complaints
      if (compRes.data?.success) {
        const d = compRes.data
        const open = (d.summary?.open || 0) + (d.summary?.assigned || 0)
        setComplaintStats({
          openCount: open,
          activeTickets: d.complaints || [],
        })
      }

      // Gate Window
      if (winRes.data?.window) {
        setGateWindow(winRes.data.window)
      }
    } catch (err) {
      console.error('Error loading student dashboard data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const name =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Student'

  const rollNo = studentProfile?.roll_no || user?.user_metadata?.roll_no || 'Pending Approval'
  const roomNo = studentProfile?.room_no || user?.user_metadata?.room_no || 'Room —'
  const isEnrolled = studentProfile?.is_face_enrolled

  return (
    <div className="animate-fade-in space-y-8 pb-12">
      {/* Welcome Hero Banner */}
      <div className="card relative overflow-hidden p-6 sm:p-8 border border-cyan-500/20 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-950">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full">
                Student Hub
              </span>
              <span className="badge badge-cyan text-[11px] font-mono">
                <Hash className="w-3 h-3" />
                {rollNo}
              </span>
              <span className="badge badge-slate text-[11px] font-mono">
                <Home className="w-3 h-3" />
                {roomNo}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
              Welcome back, {name} 👋
            </h1>
            <p className="text-sm text-slate-400 max-w-xl mt-1">
              Your autonomous hostel control panel — monitoring gate attendance, face biometrics, and maintenance requests.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => {
                loadDashboardData(true)
                if (refreshProfile) refreshProfile()
              }}
              disabled={refreshing}
              className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Syncing…' : 'Refresh'}
            </button>

            {!isEnrolled && (
              <Link
                to="/student/enroll"
                className="btn-primary text-xs px-4 py-2 flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-glow-cyan"
              >
                <Camera className="w-4 h-4" />
                Enroll Face
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Biometrics Setup Alert Banner if Not Enrolled */}
      {!isEnrolled && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-amber-200">
                Face Biometrics Setup Required
              </h3>
              <p className="text-xs text-amber-300/80">
                Your face is not yet enrolled with IRIS. Automated hostel gate and mess kiosks will not recognize you.
              </p>
            </div>
          </div>
          <Link
            to="/student/enroll"
            className="btn-primary text-xs px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold self-start sm:self-auto whitespace-nowrap shadow-glow-amber"
          >
            Start Face Enrollment ➔
          </Link>
        </div>
      )}

      {/* 4 Live KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Attendance Rate */}
        <Link
          to="/student/attendance"
          className="stat-card border border-cyan-500/20 hover:border-cyan-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Attendance Rate</span>
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-100">{attendanceStats.rate}%</p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="text-emerald-400 font-semibold">{attendanceStats.present} on-time</span>
            <span>•</span>
            <span className="text-amber-400 font-semibold">{attendanceStats.late} late</span>
          </div>
        </Link>

        {/* Biometric Status */}
        <Link
          to="/student/enroll"
          className={`stat-card border transition-all cursor-pointer group ${
            isEnrolled
              ? 'border-emerald-500/20 hover:border-emerald-500/40'
              : 'border-amber-500/20 hover:border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">IRIS Biometrics</span>
            <div
              className={`w-7 h-7 rounded-lg border flex items-center justify-center group-hover:scale-110 transition-transform ${
                isEnrolled
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              }`}
            >
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <p
            className={`text-xl font-bold ${
              isEnrolled ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            {isEnrolled ? 'Active' : 'Missing'}
          </p>
          <p className="text-xs text-slate-500">
            {isEnrolled ? 'MobileFaceNet 512-d' : 'Click to enroll'}
          </p>
        </Link>

        {/* Open Complaints */}
        <Link
          to="/student/complaints"
          className="stat-card border border-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Open Tickets</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:scale-110 transition-transform">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-100">{complaintStats.openCount}</p>
          <p className="text-xs text-slate-500">Active maintenance tickets</p>
        </Link>

        {/* Curfew Window */}
        <Link
          to="/student/attendance"
          className="stat-card border border-white/10 hover:border-white/20 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Gate Curfew</span>
            <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-200">
            {gateWindow?.end_time ? gateWindow.end_time.slice(0, 5) : '21:30'}
          </p>
          <p className="text-xs text-slate-500">
            Start: {gateWindow?.start_time ? gateWindow.start_time.slice(0, 5) : '06:00'}
          </p>
        </Link>
      </div>

      {/* Quick Action Navigation Grid */}
      <div>
        <p className="section-label">Quick Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/student/enroll"
            className="card p-5 border border-cyan-500/20 hover:border-cyan-500/40 hover:bg-slate-800/50 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Biometric Enrollment</h3>
                <p className="text-xs text-slate-500">Capture face vector with IRIS</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </Link>

          <Link
            to="/student/attendance"
            className="card p-5 border border-cyan-500/20 hover:border-cyan-500/40 hover:bg-slate-800/50 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Attendance Log</h3>
                <p className="text-xs text-slate-500">Gate checkpoints & curfew</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </Link>

          <Link
            to="/student/complaints"
            className="card p-5 border border-rose-500/20 hover:border-rose-500/40 hover:bg-slate-800/50 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">File Maintenance Ticket</h3>
                <p className="text-xs text-slate-500">Groq LLM issue classification</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-rose-400 transition-colors" />
          </Link>
        </div>
      </div>

      {/* Split Feed: Recent Attendance & Active Complaints */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Attendance Scans */}
        <div className="card p-6 border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-cyan-400" />
              Recent Gate Scans
            </h3>
            <Link
              to="/student/attendance"
              className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : attendanceStats.recentLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No recent scans recorded. Scan your face at the hostel gate to begin.
            </div>
          ) : (
            <div className="space-y-2.5">
              {attendanceStats.recentLogs.map((log) => {
                const d = new Date(log.timestamp)
                const isPresent = log.status === 'present'
                return (
                  <div
                    key={log.id || log.timestamp}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isPresent ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                      />
                      <div>
                        <p className="text-xs font-semibold text-slate-200">
                          {d.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            weekday: 'short',
                          })}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Main Gate
                        </p>
                      </div>
                    </div>
                    <span
                      className={`badge text-[10px] ${
                        isPresent ? 'badge-emerald' : 'badge-amber'
                      }`}
                    >
                      {isPresent ? 'Present' : 'Late Arrival'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Active Maintenance Tickets */}
        <div className="card p-6 border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-rose-400" />
              Active Maintenance Tickets
            </h3>
            <Link
              to="/student/complaints"
              className="text-xs text-rose-400 hover:underline flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : complaintStats.activeTickets.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No active maintenance tickets on file. Everything is running smoothly!
            </div>
          ) : (
            <div className="space-y-2.5">
              {complaintStats.activeTickets.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-200 truncate">
                      {item.short_summary || item.raw_text}
                    </p>
                    <span
                      className={`badge text-[10px] shrink-0 ${
                        item.status === 'resolved'
                          ? 'badge-emerald'
                          : item.status === 'assigned'
                          ? 'badge-cyan'
                          : 'badge-amber'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  {item.assigned_worker_note && (
                    <p className="text-[11px] text-cyan-400 font-mono truncate">
                      Note: {item.assigned_worker_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * AttendancePage.jsx
 * ==================
 * Student attendance records, gate curfew countdown, and compliance metrics.
 * Integrates directly with SENTINEL Agent (/sentinel/attendance & /sentinel/window).
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  CalendarCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  DoorOpen,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Search,
  Sparkles,
  Calendar
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { sentinelApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function AttendancePage() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [attendanceData, setAttendanceData] = useState({
    logs: [],
    present_count: 0,
    late_count: 0,
    total_records: 0,
  })
  const [windowInfo, setWindowInfo] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'present' | 'late'
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch student attendance logs from SENTINEL
  const loadData = useCallback(async (isSilent = false) => {
    if (!user?.id) return
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      const [attRes, winRes] = await Promise.all([
        sentinelApi.getAttendance(user.id, 100),
        sentinelApi.getWindow(),
      ])

      if (attRes.data?.success) {
        setAttendanceData(attRes.data)
      }
      if (winRes.data?.window) {
        setWindowInfo(winRes.data.window)
      }
    } catch (err) {
      console.error('Error fetching attendance:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let result = attendanceData.logs || []
    if (statusFilter !== 'all') {
      result = result.filter((log) => log.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (log) =>
          log.timestamp?.toLowerCase().includes(q) ||
          log.method?.toLowerCase().includes(q) ||
          log.status?.toLowerCase().includes(q)
      )
    }
    return result
  }, [attendanceData.logs, statusFilter, searchQuery])

  // Compliance percentage
  const total = attendanceData.total_records || 0
  const present = attendanceData.present_count || 0
  const rate = total > 0 ? Math.round((present / total) * 100) : 100

  // Curfew calculations
  const curfewStatus = useMemo(() => {
    if (!windowInfo?.end_time) return null
    const now = new Date()
    const [endH, endM] = windowInfo.end_time.split(':').map(Number)
    const curfewDate = new Date()
    curfewDate.setHours(endH, endM, 0, 0)

    const isAfter = now > curfewDate
    return {
      isCurfewActive: isAfter,
      endTimeFormatted: windowInfo.end_time.slice(0, 5),
      startTimeFormatted: windowInfo.start_time?.slice(0, 5) || '06:00',
    }
  }, [windowInfo])

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
              SENTINEL Gate Tracker
            </span>
            <span className="badge badge-emerald text-[11px]">Auto Verification Active</span>
          </div>
          <h1 className="page-header">Attendance History & Curfew</h1>
          <p className="page-subheader">
            Real-time biometric checkpoint records and hostel gate compliance logs.
          </p>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Syncing…' : 'Refresh Logs'}
        </button>
      </div>

      {/* Curfew Banner */}
      {curfewStatus && (
        <div
          className={`card border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            curfewStatus.isCurfewActive
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-cyan-500/30 bg-cyan-500/5'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${
                curfewStatus.isCurfewActive
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
              }`}
            >
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-200">
                  Gate Entry Window: {curfewStatus.startTimeFormatted} – {curfewStatus.endTimeFormatted}
                </h3>
                <span
                  className={`badge ${
                    curfewStatus.isCurfewActive ? 'badge-amber' : 'badge-emerald'
                  } text-[10px]`}
                >
                  {curfewStatus.isCurfewActive ? 'Curfew In Effect' : 'Gate Open'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Arrivals after {curfewStatus.endTimeFormatted} are marked as <span className="text-amber-400 font-semibold">Late</span> and logged for Warden review.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Rate card */}
        <div className="stat-card border border-cyan-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">On-Time Rate</span>
            <span className="badge badge-cyan text-[10px]">{rate}%</span>
          </div>
          <p className="text-3xl font-bold text-slate-100">{rate}%</p>
          <p className="text-xs text-slate-500">Punctuality index</p>
        </div>

        {/* Present card */}
        <div className="stat-card border border-emerald-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Present (On-Time)</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-300">{present}</p>
          <p className="text-xs text-slate-500">Total present check-ins</p>
        </div>

        {/* Late card */}
        <div className="stat-card border border-amber-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Late Check-Ins</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-amber-300">{attendanceData.late_count || 0}</p>
          <p className="text-xs text-slate-500">Curfew breaches</p>
        </div>

        {/* Total scans */}
        <div className="stat-card border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Gate Scans</span>
            <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-300">
              <CalendarCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-200">{total}</p>
          <p className="text-xs text-slate-500">Indexed gate events</p>
        </div>
      </div>

      {/* Scans Timeline Section */}
      <div className="card border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/60 border border-white/[0.06] w-fit">
            {[
              { id: 'all', label: 'All Scans' },
              { id: 'present', label: 'Present' },
              { id: 'late', label: 'Late' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === tab.id
                    ? 'bg-cyan-500 text-slate-950 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search date or status…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl glass text-xs text-slate-200 placeholder-slate-500 border border-white/[0.08] focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {/* Logs Table / List */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <LoadingSpinner size="lg" />
            <p className="text-xs text-slate-500 mt-3">Loading SENTINEL gate logs…</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">No Attendance Records</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Your biometric scans at the main gate scanner will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="pb-3 pl-2">Timestamp & Date</th>
                  <th className="pb-3">Gate Point</th>
                  <th className="pb-3">Verification Method</th>
                  <th className="pb-3 text-right pr-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredLogs.map((log) => {
                  const d = new Date(log.timestamp)
                  const isPresent = log.status === 'present'
                  return (
                    <tr
                      key={log.id || log.timestamp}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3.5 pl-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              isPresent ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                          />
                          <div>
                            <p className="font-semibold text-slate-200">
                              {d.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {d.toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 text-slate-400 font-mono">
                        Main Hostel Gate
                      </td>
                      <td className="py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] font-mono text-cyan-300">
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          {log.method === 'face' ? 'IRIS Face Bio' : log.method || 'Biometric'}
                        </span>
                      </td>
                      <td className="py-3.5 text-right pr-2">
                        <span
                          className={`badge ${
                            isPresent ? 'badge-emerald' : 'badge-amber'
                          }`}
                        >
                          {isPresent ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {isPresent ? 'Present' : 'Late Arrival'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

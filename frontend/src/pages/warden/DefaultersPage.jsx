/**
 * DefaultersPage.jsx — Phase 7D
 * ================================
 * Warden views the daily gate defaulters list from SENTINEL.
 * Supports date picker + on-demand trigger check.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Users, Calendar, RefreshCw, Search,
  AlertTriangle, Hash, Home, CheckCircle2, Zap
} from 'lucide-react'
import { wardenApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => {
  const d = new Date()
  return d.toISOString().split('T')[0]  // YYYY-MM-DD
}

export default function DefaultersPage() {
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [running,    setRunning]    = useState(false)
  const [targetDate, setTargetDate] = useState(todayStr())
  const [defaulters, setDefaulters] = useState([])
  const [total,      setTotal]      = useState(0)
  const [search,     setSearch]     = useState('')
  const [error,      setError]      = useState(null)

  const loadDefaulters = useCallback(async (silent = false, date = targetDate) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const res = await wardenApi.getDefaulters(date)
      setDefaulters(res.data?.defaulters ?? [])
      setTotal(res.data?.total_enrolled ?? 0)
    } catch (err) {
      setError(err?.detail ?? 'Failed to load defaulters.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [targetDate])

  useEffect(() => { loadDefaulters(false) }, [])

  const handleDateChange = (e) => {
    const d = e.target.value
    setTargetDate(d)
    loadDefaulters(true, d)
  }

  const handleTriggerCheck = async () => {
    setRunning(true)
    try {
      await wardenApi.triggerDefaultersCheck()
      await loadDefaulters(true)
    } catch {
      // ignore
    } finally {
      setRunning(false)
    }
  }

  const filtered = defaulters.filter((s) =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.roll_no?.toLowerCase().includes(search.toLowerCase()) ||
    s.room_no?.toLowerCase().includes(search.toLowerCase())
  )

  const attendanceRate = total > 0
    ? Math.round(((total - defaulters.length) / total) * 100)
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <p className="text-xs text-amber-400 font-semibold uppercase tracking-widest mb-1">
            SENTINEL · Attendance
          </p>
          <h1 className="page-header">Gate Defaulters Roster</h1>
          <p className="page-subheader">
            Students who missed the gate attendance window for the selected date.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleTriggerCheck}
            disabled={running || refreshing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {running
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Zap className="w-4 h-4" />
            }
            {running ? 'Running…' : 'Run Check'}
          </button>
          <button
            onClick={() => loadDefaulters(true)}
            disabled={refreshing}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card border border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-2xl font-bold text-slate-200">{defaulters.length}</p>
            <p className="text-xs text-slate-400">Defaulters</p>
          </div>
        </div>
        <div className="stat-card border border-emerald-500/20 bg-emerald-500/5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-2xl font-bold text-slate-200">{Math.max(0, total - defaulters.length)}</p>
            <p className="text-xs text-slate-400">Present</p>
          </div>
        </div>
        <div className="stat-card border border-violet-500/20 bg-violet-500/5">
          <Users className="w-5 h-5 text-violet-400" />
          <div>
            <p className="text-2xl font-bold text-slate-200">{total}</p>
            <p className="text-xs text-slate-400">Total Enrolled</p>
          </div>
        </div>
        <div className={`stat-card border ${
          attendanceRate === null ? 'border-slate-500/20 bg-slate-500/5' :
          attendanceRate >= 80   ? 'border-emerald-500/20 bg-emerald-500/5' :
          attendanceRate >= 60   ? 'border-amber-500/20 bg-amber-500/5'    :
                                   'border-rose-500/20 bg-rose-500/5'
        }`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
            attendanceRate === null ? 'text-slate-400' :
            attendanceRate >= 80   ? 'text-emerald-400' :
            attendanceRate >= 60   ? 'text-amber-400' : 'text-rose-400'
          }`}>%</div>
          <div>
            <p className={`text-2xl font-bold ${
              attendanceRate === null ? 'text-slate-400' :
              attendanceRate >= 80   ? 'text-emerald-300' :
              attendanceRate >= 60   ? 'text-amber-300' : 'text-rose-300'
            }`}>
              {attendanceRate !== null ? `${attendanceRate}%` : '—'}
            </p>
            <p className="text-xs text-slate-400">Attendance Rate</p>
          </div>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="date"
            className="input pl-9 w-48"
            value={targetDate}
            max={todayStr()}
            onChange={handleDateChange}
          />
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9 w-full"
            placeholder="Search by name, roll no, or room…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card border border-white/[0.08] py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">
            {search
              ? 'No defaulters match your search.'
              : `No defaulters for ${targetDate}. Great attendance!`
            }
          </p>
        </div>
      ) : (
        <div className="card border border-white/[0.08] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left">
                  <th className="px-4 py-3 text-xs text-slate-400 font-semibold">#</th>
                  <th className="px-4 py-3 text-xs text-slate-400 font-semibold">Name</th>
                  <th className="px-4 py-3 text-xs text-slate-400 font-semibold">Roll No.</th>
                  <th className="px-4 py-3 text-xs text-slate-400 font-semibold">Room</th>
                  <th className="px-4 py-3 text-xs text-slate-400 font-semibold">Email</th>
                  <th className="px-4 py-3 text-xs text-slate-400 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr
                    key={s.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-slate-500">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-semibold shrink-0">
                          {s.name?.[0] ?? '?'}
                        </div>
                        <span className="text-sm text-slate-200 font-medium">{s.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-300">
                        <Hash className="w-3.5 h-3.5 text-slate-500" />
                        {s.roll_no ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-300">
                        <Home className="w-3.5 h-3.5 text-slate-500" />
                        {s.room_no ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate">
                      {s.email ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge badge-rose text-[10px]">Absent</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {filtered.length} of {defaulters.length} defaulters
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

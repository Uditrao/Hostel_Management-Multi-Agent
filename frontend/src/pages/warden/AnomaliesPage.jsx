/**
 * AnomaliesPage.jsx — Phase 7D
 * ==============================
 * Warden views HERALD cross-agent anomaly flags, triggers on-demand runs,
 * and marks flags as seen.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, RefreshCw, Zap, Eye,
  CheckCircle2, Filter, Clock, User,
  Hash, Home, Cpu, ChevronDown, ChevronUp
} from 'lucide-react'
import { wardenApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const FLAG_TYPES = [
  { value: '',                        label: 'All Types' },
  { value: 'attendance_missed',       label: 'Attendance Missed' },
  { value: 'mess_missed_streak',      label: 'Mess Missed Streak' },
  { value: 'unresolved_complaint',    label: 'Unresolved Complaint' },
]

const typeBadge = (t) => ({
  attendance_missed:    'badge-amber',
  mess_missed_streak:   'badge-violet',
  unresolved_complaint: 'badge-rose',
}[t] ?? 'badge-slate')

const typeLabel = (t) => ({
  attendance_missed:    'Attendance Missed',
  mess_missed_streak:   'Mess Missed Streak',
  unresolved_complaint: 'Unresolved Complaint',
}[t] ?? t)

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function AnomaliesPage() {
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [running,     setRunning]     = useState(false)
  const [flags,       setFlags]       = useState([])
  const [total,       setTotal]       = useState(0)
  const [unseenOnly,  setUnseenOnly]  = useState(false)
  const [filterType,  setFilterType]  = useState('')
  const [markingId,   setMarkingId]   = useState(null)
  const [runResult,   setRunResult]   = useState(null)
  const [summary,     setSummary]     = useState(null)
  const [showSummary, setShowSummary] = useState(true)

  const loadFlags = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [flagsRes, summaryRes] = await Promise.all([
        wardenApi.getAnomalies({
          unseenOnly,
          flagType: filterType || null,
          limit: 200,
        }),
        wardenApi.getHeraldSummary(false),
      ])
      setFlags(flagsRes.data?.flags ?? [])
      setTotal(flagsRes.data?.total ?? 0)
      setSummary(summaryRes.data?.summary ?? null)
    } catch {
      // keep
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [unseenOnly, filterType])

  useEffect(() => { loadFlags(false) }, [unseenOnly, filterType])

  const handleRunHerald = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await wardenApi.runHerald()
      setRunResult({
        type: 'success',
        text: `HERALD run complete — ${res.data?.new_flags_created ?? 0} new flags created.`,
      })
      await loadFlags(true)
    } catch (err) {
      setRunResult({
        type: 'error',
        text: err?.detail ?? 'HERALD run failed.',
      })
    } finally {
      setRunning(false)
    }
  }

  const handleMarkSeen = async (flagId) => {
    setMarkingId(flagId)
    try {
      await wardenApi.markAnomalySeen(flagId)
      setFlags((prev) =>
        prev.map((f) => (f.id === flagId ? { ...f, seen_by_warden: true } : f))
      )
    } catch {
      // ignore
    } finally {
      setMarkingId(null)
    }
  }

  const handleMarkAllSeen = async () => {
    const unseen = flags.filter((f) => !f.seen_by_warden)
    for (const f of unseen) {
      await handleMarkSeen(f.id)
    }
  }

  const unseenCount = flags.filter((f) => !f.seen_by_warden).length

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
          <p className="text-xs text-violet-400 font-semibold uppercase tracking-widest mb-1">
            HERALD · Orchestrator
          </p>
          <h1 className="page-header">Cross-Agent Anomaly Stream</h1>
          <p className="page-subheader">
            Autonomous anomaly correlation across IRIS, SENTINEL, NOURISH, and FIXR.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {unseenCount > 0 && (
            <button
              onClick={handleMarkAllSeen}
              className="btn-ghost text-sm flex items-center gap-2"
            >
              <Eye className="w-4 h-4" /> Mark all seen
            </button>
          )}
          <button
            onClick={handleRunHerald}
            disabled={running}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {running
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running…</>
              : <><Zap className="w-4 h-4" /> Run HERALD</>
            }
          </button>
          <button
            onClick={() => loadFlags(true)}
            disabled={refreshing}
            className="btn-ghost"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Run result banner */}
      {runResult && (
        <div className={`p-3 rounded-lg text-sm border ${
          runResult.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
        }`}>
          {runResult.text}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card border border-violet-500/20 bg-violet-500/5">
          <AlertTriangle className="w-5 h-5 text-violet-400" />
          <div>
            <p className="text-2xl font-bold text-slate-200">{total}</p>
            <p className="text-xs text-slate-400">Total Flags</p>
          </div>
        </div>
        <div className="stat-card border border-amber-500/20 bg-amber-500/5">
          <Eye className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-2xl font-bold text-slate-200">{unseenCount}</p>
            <p className="text-xs text-slate-400">Unread</p>
          </div>
        </div>
        {['attendance_missed', 'mess_missed_streak', 'unresolved_complaint'].map((type) => {
          const count = flags.filter((f) => f.type === type).length
          return null // we only show 4 cards — skip for brevity
        })}
        <div className="stat-card border border-amber-500/20 bg-amber-500/5">
          <User className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-2xl font-bold text-slate-200">
              {flags.filter(f => f.type === 'attendance_missed').length}
            </p>
            <p className="text-xs text-slate-400">Attendance</p>
          </div>
        </div>
        <div className="stat-card border border-rose-500/20 bg-rose-500/5">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          <div>
            <p className="text-2xl font-bold text-slate-200">
              {flags.filter(f => f.type === 'unresolved_complaint').length}
            </p>
            <p className="text-xs text-slate-400">Open Complaints</p>
          </div>
        </div>
      </div>

      {/* HERALD AI Summary */}
      {summary && (
        <div className="card border border-violet-500/20 p-5">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="w-full flex items-center gap-2 text-left"
          >
            <Cpu className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-sm font-semibold text-slate-200">HERALD AI Briefing</span>
            <span className="badge badge-violet text-[10px] ml-2">AI Generated</span>
            <span className="ml-auto">
              {showSummary
                ? <ChevronUp className="w-4 h-4 text-slate-500" />
                : <ChevronDown className="w-4 h-4 text-slate-500" />
              }
            </span>
          </button>
          {showSummary && (
            <p className="text-sm text-slate-300 leading-relaxed mt-3 pt-3 border-t border-white/[0.06]">
              {summary}
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="unseenOnly"
            checked={unseenOnly}
            onChange={(e) => setUnseenOnly(e.target.checked)}
            className="rounded border-white/20 bg-white/5 text-violet-500"
          />
          <label htmlFor="unseenOnly" className="text-sm text-slate-300 cursor-pointer">
            Unread only
            {unseenCount > 0 && (
              <span className="ml-2 badge badge-violet text-[10px]">{unseenCount}</span>
            )}
          </label>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <select
            className="input pl-8 pr-8 appearance-none cursor-pointer"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            {FLAG_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-slate-500 self-center">
          {flags.length} flag{flags.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty state */}
      {flags.length === 0 && (
        <div className="card border border-white/[0.08] py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">
            {unseenOnly ? 'No unread flags — all caught up!' : 'No anomaly flags found.'}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            Click "Run HERALD" to trigger a fresh cross-agent anomaly scan.
          </p>
        </div>
      )}

      {/* Flag cards */}
      <div className="space-y-2">
        {flags.map((flag) => (
          <div
            key={flag.id}
            className={`card border transition-all ${
              flag.seen_by_warden
                ? 'border-white/[0.05] bg-white/[0.01] opacity-70'
                : 'border-violet-500/20 bg-violet-500/[0.03]'
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              {/* Type badge */}
              <span className={`badge text-[10px] shrink-0 mt-0.5 ${typeBadge(flag.type)}`}>
                {typeLabel(flag.type)}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 font-medium">
                  {flag.student?.name ?? 'Unknown Student'}
                </p>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                  {flag.student?.roll_no && (
                    <span className="flex items-center gap-1">
                      <Hash className="w-3 h-3" /> {flag.student.roll_no}
                    </span>
                  )}
                  {flag.student?.room_no && (
                    <span className="flex items-center gap-1">
                      <Home className="w-3 h-3" /> Room {flag.student.room_no}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {fmtDate(flag.created_at)}
                  </span>
                </div>
                {flag.detail && (
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    {flag.detail}
                  </p>
                )}
              </div>

              {/* Action */}
              {!flag.seen_by_warden ? (
                <button
                  onClick={() => handleMarkSeen(flag.id)}
                  disabled={markingId === flag.id}
                  className="btn-ghost text-xs shrink-0 flex items-center gap-1 py-1"
                >
                  {markingId === flag.id
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <Eye className="w-3.5 h-3.5" />
                  }
                  Mark seen
                </button>
              ) : (
                <span className="text-[10px] text-slate-600 shrink-0 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Seen
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

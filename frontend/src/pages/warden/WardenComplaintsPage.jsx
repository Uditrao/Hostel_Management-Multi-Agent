/**
 * WardenComplaintsPage.jsx — Phase 7D
 * ======================================
 * Warden views, filters, and resolves all FIXR maintenance tickets.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Wrench, RefreshCw, Search, Filter,
  CheckCircle2, Clock, AlertTriangle, ChevronDown,
  User, Hash, Home, Save, X
} from 'lucide-react'
import { wardenApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS   = ['', 'open', 'assigned', 'resolved']
const CATEGORY_OPTIONS = ['', 'electrical', 'plumbing', 'carpentry', 'other']
const URGENCY_OPTIONS  = ['', 'critical', 'high', 'medium', 'low']

const urgencyBadge = (u) => ({
  critical: 'badge-rose',
  high:     'badge-amber',
  medium:   'badge-violet',
  low:      'badge-slate',
}[u] ?? 'badge-slate')

const statusBadge = (s) => ({
  open:     'badge-rose',
  assigned: 'badge-amber',
  resolved: 'badge-emerald',
}[s] ?? 'badge-slate')

const categoryIcon = (c) => ({
  electrical: '⚡',
  plumbing:   '🔧',
  carpentry:  '🪚',
  other:      '📋',
}[c] ?? '📋')

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function WardenComplaintsPage() {
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [complaints, setComplaints] = useState([])
  const [summary,    setSummary]    = useState({})
  const [search,     setSearch]     = useState('')
  const [filters,    setFilters]    = useState({ status: '', category: '', urgency: '' })
  const [expanded,   setExpanded]   = useState(null)  // active complaint id
  const [editing,    setEditing]    = useState({})     // { id: { status, note } }
  const [saving,     setSaving]     = useState({})
  const [saveMsg,    setSaveMsg]    = useState({})

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [cRes, sRes] = await Promise.all([
        wardenApi.getComplaints({
          status:   filters.status   || null,
          category: filters.category || null,
          urgency:  filters.urgency  || null,
          limit: 100,
        }),
        wardenApi.getComplaintsSummary(),
      ])
      setComplaints(cRes.data?.complaints ?? [])
      setSummary(cRes.data?.global_summary ?? sRes.data ?? {})
    } catch {
      // keep current
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filters])

  useEffect(() => { loadData(false) }, [filters])

  const setFilter = (key, val) => {
    setFilters((f) => ({ ...f, [key]: val }))
  }

  const toggleExpand = (id) => {
    setExpanded((e) => (e === id ? null : id))
    setEditing((ed) => ({ ...ed, [id]: ed[id] ?? { status: '', note: '' } }))
    setSaveMsg((m) => ({ ...m, [id]: null }))
  }

  const handleEditChange = (id, key, val) => {
    setEditing((ed) => ({ ...ed, [id]: { ...ed[id], [key]: val } }))
  }

  const handleSave = async (complaint) => {
    const ed = editing[complaint.id] ?? {}
    const payload = {}
    if (ed.status)    payload.status = ed.status
    if (ed.note !== undefined && ed.note !== null) payload.assigned_worker_note = ed.note

    if (!payload.status && !payload.assigned_worker_note) {
      setSaveMsg((m) => ({ ...m, [complaint.id]: { type: 'error', text: 'Nothing to update.' } }))
      return
    }
    setSaving((s) => ({ ...s, [complaint.id]: true }))
    try {
      await wardenApi.patchComplaint(complaint.id, payload)
      setSaveMsg((m) => ({ ...m, [complaint.id]: { type: 'success', text: 'Complaint updated successfully.' } }))
      await loadData(true)
    } catch (err) {
      setSaveMsg((m) => ({
        ...m,
        [complaint.id]: { type: 'error', text: err?.detail ?? 'Update failed.' },
      }))
    } finally {
      setSaving((s) => ({ ...s, [complaint.id]: false }))
    }
  }

  const filtered = complaints.filter((c) =>
    !search ||
    c.raw_text?.toLowerCase().includes(search.toLowerCase()) ||
    c.short_summary?.toLowerCase().includes(search.toLowerCase()) ||
    c.student?.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.student?.roll_no?.toLowerCase().includes(search.toLowerCase())
  )

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
          <p className="text-xs text-rose-400 font-semibold uppercase tracking-widest mb-1">
            FIXR · Maintenance Tickets
          </p>
          <h1 className="page-header">Complaints Management</h1>
          <p className="page-subheader">
            Review, assign workers, and resolve AI-triaged maintenance tickets.
          </p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="btn-ghost flex items-center gap-2 text-sm self-start"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Open',     val: summary.open ?? '—',     color: 'rose',    icon: AlertTriangle },
          { label: 'Assigned', val: summary.assigned ?? '—', color: 'amber',   icon: Wrench },
          { label: 'Resolved', val: summary.resolved ?? '—', color: 'emerald', icon: CheckCircle2 },
          { label: 'Critical/High Open', val: summary.high_critical_open ?? '—', color: 'rose', icon: AlertTriangle },
        ].map(({ label, val, color, icon: Icon }) => (
          <div key={label} className={`stat-card border border-${color}-500/20 bg-${color}-500/5`}>
            <Icon className={`w-5 h-5 text-${color}-400`} />
            <div>
              <p className="text-2xl font-bold text-slate-200">{val}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9 w-full"
            placeholder="Search complaint, student…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {[
          { key: 'status',   label: 'Status',   options: STATUS_OPTIONS },
          { key: 'urgency',  label: 'Urgency',  options: URGENCY_OPTIONS },
          { key: 'category', label: 'Category', options: CATEGORY_OPTIONS },
        ].map(({ key, label, options }) => (
          <div key={key} className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <select
              className="input pl-8 pr-8 appearance-none cursor-pointer"
              value={filters[key]}
              onChange={(e) => setFilter(key, e.target.value)}
            >
              {options.map((o) => (
                <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : `All ${label}s`}</option>
              ))}
            </select>
          </div>
        ))}
        <span className="badge badge-slate text-xs self-center whitespace-nowrap">
          {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="card border border-white/[0.08] py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">No complaints match the current filters.</p>
        </div>
      )}

      {/* Complaints list */}
      <div className="space-y-2">
        {filtered.map((c) => {
          const isOpen = expanded === c.id
          const ed     = editing[c.id] ?? { status: '', note: '' }
          const msg    = saveMsg[c.id]
          const busy   = saving[c.id]

          return (
            <div key={c.id} className="card border border-white/[0.08] overflow-hidden">
              {/* Row */}
              <button
                onClick={() => toggleExpand(c.id)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                {/* Urgency dot */}
                <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                  c.urgency === 'critical' ? 'bg-rose-400'   :
                  c.urgency === 'high'     ? 'bg-amber-400'  :
                  c.urgency === 'medium'   ? 'bg-violet-400' : 'bg-slate-500'
                } animate-${c.urgency === 'critical' ? 'pulse' : 'none'}`} />
                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`badge text-[10px] ${urgencyBadge(c.urgency)}`}>{c.urgency}</span>
                    <span className={`badge text-[10px] ${statusBadge(c.status)}`}>{c.status}</span>
                    <span className="badge badge-slate text-[10px]">
                      {categoryIcon(c.category)} {c.category}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 font-medium line-clamp-2">
                    {c.short_summary || c.raw_text}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 flex-wrap">
                    {c.student?.name && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {c.student.name}
                      </span>
                    )}
                    {c.student?.roll_no && (
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" /> {c.student.roll_no}
                      </span>
                    )}
                    {c.student?.room_no && (
                      <span className="flex items-center gap-1">
                        <Home className="w-3 h-3" /> Room {c.student.room_no}
                      </span>
                    )}
                    <span className="flex items-center gap-1 ml-auto">
                      <Clock className="w-3 h-3" /> {fmtDate(c.created_at)}
                    </span>
                  </div>
                  {c.assigned_worker_note && (
                    <p className="text-[11px] text-amber-300/80 mt-1">
                      Worker: {c.assigned_worker_note}
                    </p>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform mt-1 ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Expansion panel — warden actions */}
              {isOpen && (
                <div className="border-t border-white/[0.06] p-4 bg-white/[0.01] space-y-4">
                  {/* Full complaint text */}
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Full Complaint</p>
                    <p className="text-sm text-slate-300 leading-relaxed bg-white/[0.02] border border-white/[0.05] rounded-lg p-3">
                      {c.raw_text}
                    </p>
                  </div>
                  {/* Update form */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Update Status</label>
                      <select
                        className="input w-full appearance-none"
                        value={ed.status}
                        onChange={(e) => handleEditChange(c.id, 'status', e.target.value)}
                      >
                        <option value="">Keep current ({c.status})</option>
                        {['open', 'assigned', 'resolved'].filter(s => s !== c.status).map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Worker Note</label>
                      <input
                        className="input w-full"
                        placeholder="Assign worker or add note…"
                        value={ed.note ?? c.assigned_worker_note ?? ''}
                        onChange={(e) => handleEditChange(c.id, 'note', e.target.value)}
                      />
                    </div>
                  </div>

                  {msg && (
                    <div className={`p-2.5 rounded-lg text-xs ${
                      msg.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                    }`}>
                      {msg.text}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(c)}
                      disabled={busy}
                      className="btn-primary flex items-center gap-2 text-sm"
                    >
                      {busy
                        ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
                        : <><Save className="w-4 h-4" /> Save Changes</>
                      }
                    </button>
                    <button onClick={() => toggleExpand(c.id)} className="btn-ghost text-sm flex items-center gap-1">
                      <X className="w-4 h-4" /> Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

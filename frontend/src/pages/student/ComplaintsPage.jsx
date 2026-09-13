/**
 * ComplaintsPage.jsx
 * ==================
 * Student maintenance complaint desk and active ticket tracker.
 * Integrates directly with the FIXR Agent (POST /fixr/complaint & GET /fixr/complaints/mine).
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Wrench,
  Zap,
  Droplets,
  Hammer,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Sparkles,
  RefreshCw,
  UserCheck,
  ChevronDown,
  ChevronUp,
  MessageSquarePlus
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { fixrApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const PRESET_CHIPS = [
  'Bathroom tap is leaking continuously and overflowing the drain.',
  'Ceiling fan regulator is sparking and making buzzing noise.',
  'Room wooden door latch is loose and won’t lock properly.',
  'Tube light in study desk is flickering constantly.',
  'Geyser water heater is not heating water in the morning.',
]

const CATEGORY_MAP = {
  plumbing:   { label: 'Plumbing',   icon: Droplets,   color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  electrical: { label: 'Electrical', icon: Zap,        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  carpentry:  { label: 'Carpentry',  icon: Hammer,     color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  other:      { label: 'General',    icon: HelpCircle, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
}

const URGENCY_MAP = {
  critical: { label: 'Critical', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse' },
  high:     { label: 'High',     badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  medium:   { label: 'Medium',   badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  low:      { label: 'Low',      badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
}

export default function ComplaintsPage() {
  const { user } = useAuth()

  const [rawText, setRawText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState(null)

  const [complaints, setComplaints] = useState([])
  const [summary, setSummary] = useState({ total: 0, open: 0, assigned: 0, resolved: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'open' | 'assigned' | 'resolved'
  const [expandedId, setExpandedId] = useState(null)

  // Load student's complaints
  const loadComplaints = useCallback(async (isSilent = false) => {
    if (!user?.id) return
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      const res = await fixrApi.getMyComplaints(user.id)
      if (res.data?.success) {
        setComplaints(res.data.complaints || [])
        setSummary(res.data.summary || {})
      }
    } catch (err) {
      console.error('Error fetching complaints:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadComplaints()
  }, [loadComplaints])

  // Handle complaint submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!rawText.trim() || rawText.trim().length < 10) {
      setSubmitResult({
        success: false,
        message: 'Please provide at least 10 characters describing the issue.',
      })
      return
    }

    setSubmitting(true)
    setSubmitResult(null)

    try {
      const res = await fixrApi.submitComplaint(user.id, rawText.trim())
      if (res.data?.success) {
        const item = res.data.complaint
        setSubmitResult({
          success: true,
          message: `Ticket #${item.id.slice(0, 8)} created! FIXR classified it as [${item.category?.toUpperCase()}] with ${item.urgency?.toUpperCase()} priority.`,
        })
        setRawText('')
        await loadComplaints(true)
      } else {
        setSubmitResult({
          success: false,
          message: res.data?.message || 'Failed to submit complaint.',
        })
      }
    } catch (err) {
      console.error('Submission error:', err)
      setSubmitResult({
        success: false,
        message: err.detail || err.response?.data?.detail || 'Failed to submit complaint to FIXR.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Filter complaints
  const filteredComplaints = useMemo(() => {
    if (statusFilter === 'all') return complaints
    return complaints.filter((c) => c.status === statusFilter)
  }, [complaints, statusFilter])

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
              FIXR Maintenance Agent
            </span>
            <span className="badge badge-emerald text-[11px]">
              <Sparkles className="w-3 h-3" />
              Groq LLM Triage
            </span>
          </div>
          <h1 className="page-header">Hostel Maintenance & Complaints</h1>
          <p className="page-subheader">
            Submit issues in plain English or Hindi. FIXR automatically prioritizes and routes tickets to the Warden.
          </p>
        </div>

        <button
          onClick={() => loadComplaints(true)}
          disabled={refreshing}
          className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Syncing…' : 'Refresh Tickets'}
        </button>
      </div>

      {/* Submission Form Card */}
      <div className="card border border-rose-500/20 p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">File a New Maintenance Request</h2>
              <p className="text-xs text-slate-500">Supports English, Hindi, and Hinglish descriptions</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-500">{rawText.length}/2000 chars</span>
        </div>

        {/* Quick Suggestion Chips */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Quick Issue Presets:
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setRawText(chip)}
                className="text-xs px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 transition-all text-left"
              >
                {chip.length > 40 ? chip.slice(0, 40) + '…' : chip}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="e.g. Room 304 fan regulator is sparking and making a burning smell, please send someone immediately..."
              className="w-full px-4 py-3 rounded-2xl glass text-slate-200 placeholder-slate-500 border border-white/10 focus:outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all text-sm resize-none"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              <span>FIXR will extract Category & Urgency automatically</span>
            </div>

            <button
              type="submit"
              disabled={submitting || rawText.trim().length < 10}
              className="btn-primary py-2.5 px-6 text-xs flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 font-semibold shadow-glow-rose disabled:opacity-50"
            >
              {submitting ? <LoadingSpinner size="sm" /> : <Send className="w-3.5 h-3.5" />}
              {submitting ? 'Analyzing & Filing…' : 'Submit Ticket'}
            </button>
          </div>
        </form>

        {/* Submission Result Banner */}
        {submitResult && (
          <div
            className={`p-4 rounded-2xl border animate-slide-up flex items-start gap-3 ${
              submitResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {submitResult.success ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            )}
            <div className="text-xs">
              <p className="font-semibold text-sm mb-0.5">
                {submitResult.success ? 'Request Filed Successfully' : 'Submission Error'}
              </p>
              <p>{submitResult.message}</p>
            </div>
          </div>
        )}
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card border border-white/10">
          <span className="text-xs text-slate-400">Total Submitted</span>
          <p className="text-2xl font-bold text-slate-100">{summary.total || complaints.length}</p>
          <span className="text-[11px] text-slate-500">All-time tickets</span>
        </div>
        <div className="stat-card border border-amber-500/20">
          <span className="text-xs text-amber-400">Open Tickets</span>
          <p className="text-2xl font-bold text-amber-300">{summary.open || 0}</p>
          <span className="text-[11px] text-slate-500">Pending assignment</span>
        </div>
        <div className="stat-card border border-cyan-500/20">
          <span className="text-xs text-cyan-400">Assigned / In-Progress</span>
          <p className="text-2xl font-bold text-cyan-300">{summary.assigned || 0}</p>
          <span className="text-[11px] text-slate-500">Worker scheduled</span>
        </div>
        <div className="stat-card border border-emerald-500/20">
          <span className="text-xs text-emerald-400">Resolved</span>
          <p className="text-2xl font-bold text-emerald-300">{summary.resolved || 0}</p>
          <span className="text-[11px] text-slate-500">Completed & closed</span>
        </div>
      </div>

      {/* Tickets List Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-rose-400" />
            Your Maintenance Tickets
          </h2>

          {/* Status Filter tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/60 border border-white/[0.06] w-fit">
            {[
              { id: 'all', label: 'All' },
              { id: 'open', label: 'Open' },
              { id: 'assigned', label: 'Assigned' },
              { id: 'resolved', label: 'Resolved' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === tab.id
                    ? 'bg-rose-600 text-white shadow-glow-rose'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="card py-16 flex flex-col items-center justify-center">
            <LoadingSpinner size="lg" />
            <p className="text-xs text-slate-500 mt-3">Loading tickets from FIXR…</p>
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="card py-16 text-center border border-white/[0.06]">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
              <Wrench className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">No Tickets Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              You have no {statusFilter !== 'all' ? statusFilter : ''} maintenance tickets on file.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredComplaints.map((item) => {
              const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.other
              const urg = URGENCY_MAP[item.urgency] || URGENCY_MAP.medium
              const CatIcon = cat.icon
              const isExpanded = expandedId === item.id

              return (
                <div
                  key={item.id}
                  className="card border border-white/[0.06] p-5 hover:border-white/15 transition-all space-y-3"
                >
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${cat.color}`}>
                        <CatIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-200">
                            {item.short_summary || item.raw_text.slice(0, 60)}
                          </span>
                          <span className={`badge border text-[10px] ${cat.color}`}>
                            {cat.label}
                          </span>
                          <span className={`badge border text-[10px] ${urg.badge}`}>
                            {urg.label} Priority
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          ID: #{item.id.slice(0, 8)} • Filed:{' '}
                          {new Date(item.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span
                        className={`badge ${
                          item.status === 'resolved'
                            ? 'badge-emerald'
                            : item.status === 'assigned'
                            ? 'badge-cyan'
                            : 'badge-amber'
                        }`}
                      >
                        {item.status === 'resolved' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : item.status === 'assigned' ? (
                          <UserCheck className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        <span className="capitalize">{item.status}</span>
                      </span>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Worker Note if Assigned */}
                  {item.assigned_worker_note && (
                    <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-start gap-2.5 text-xs text-cyan-200">
                      <UserCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-cyan-300">Warden / Worker Assignment: </span>
                        {item.assigned_worker_note}
                      </div>
                    </div>
                  )}

                  {/* Expandable original text */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-white/[0.04] text-xs text-slate-400 space-y-1 animate-fade-in">
                      <p className="font-medium text-slate-300">Original Complaint Text:</p>
                      <p className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] whitespace-pre-wrap font-sans">
                        {item.raw_text}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

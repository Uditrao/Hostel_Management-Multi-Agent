import { useState, useEffect } from 'react'
import { Clock, Calendar, Check, X, Sparkles, AlertCircle } from 'lucide-react'
import { sentinelApi, wardenApi } from '../../services/api'
import LoadingSpinner from '../common/LoadingSpinner'

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PRESETS = [
  { label: 'Night Curfew (8 PM - 10:30 PM)', start: '20:00', end: '22:30', days: ALL_DAYS },
  { label: 'Late Curfew (9 PM - 11:30 PM)', start: '21:00', end: '23:30', days: ALL_DAYS },
  { label: 'All-Day Access (6 AM - 10:30 PM)', start: '06:00', end: '22:30', days: ALL_DAYS },
  { label: 'Morning Gate (6:30 AM - 9:30 AM)', start: '06:30', end: '09:30', days: ALL_DAYS },
]

export default function AttendanceWindowModal({ isOpen, onClose, initialWindow, onSaved }) {
  const [startTime, setStartTime] = useState('20:00')
  const [endTime, setEndTime] = useState('22:30')
  const [activeDays, setActiveDays] = useState(ALL_DAYS)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  useEffect(() => {
    if (initialWindow) {
      if (initialWindow.start_time) setStartTime(initialWindow.start_time.slice(0, 5))
      if (initialWindow.end_time) setEndTime(initialWindow.end_time.slice(0, 5))
      if (Array.isArray(initialWindow.active_days) && initialWindow.active_days.length > 0) {
        setActiveDays(initialWindow.active_days)
      }
    }
  }, [initialWindow])

  if (!isOpen) return null

  const toggleDay = (day) => {
    setActiveDays((prev) =>
      prev.includes(day)
        ? prev.length > 1 ? prev.filter((d) => d !== day) : prev
        : [...prev, day]
    )
  }

  const applyPreset = (preset) => {
    setStartTime(preset.start)
    setEndTime(preset.end)
    setActiveDays(preset.days)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setSubmitting(true)

    try {
      const payload = {
        start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
        end_time: endTime.length === 5 ? `${endTime}:00` : endTime,
        active_days: activeDays,
      }

      const apiFn = wardenApi?.updateWindow || sentinelApi?.updateWindow
      const res = await apiFn(payload)
      if (res.data?.success) {
        setSuccessMsg('Attendance window successfully updated!')
        if (onSaved) {
          onSaved(res.data.window || payload)
        }
        setTimeout(() => {
          onClose()
          setSuccessMsg(null)
        }, 800)
      } else {
        setError(res.data?.message || 'Failed to update window.')
      }
    } catch (err) {
      console.error('Update window error:', err)
      setError(
        err.response?.data?.detail ||
        err.message ||
        'Could not save window timings. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-[#0f0f11] border border-white/10 rounded-2xl shadow-2xl p-6 text-slate-100 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Configure Curfew Window</h2>
              <p className="text-xs text-slate-400">Gate attendance policy & automated late enforcement</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Quick Presets */}
        <div className="mt-4">
          <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Quick Presets
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={`text-left text-xs p-2.5 rounded-lg border transition-all ${
                  startTime === p.start && endTime === p.end
                    ? 'border-violet-500 bg-violet-500/15 text-white'
                    : 'border-white/5 bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <div className="font-semibold text-slate-200 truncate">{p.label}</div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{p.start} — {p.end}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Timings Form */}
        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
                Window Opens (Start)
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-violet-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">Expected check-in start</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
                Curfew Cutoff (End)
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-violet-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">Entry after this is Late</span>
            </div>
          </div>

          {/* Active Days */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Active Curfew Days
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDays(ALL_DAYS)}
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  All Days
                </button>
                <span className="text-slate-600">·</span>
                <button
                  type="button"
                  onClick={() => setActiveDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])}
                  className="text-[10px] text-slate-400 hover:underline font-mono"
                >
                  Weekdays
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ALL_DAYS.map((day) => {
                const isSelected = activeDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                      isSelected
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-white/[0.03] text-slate-400 border border-white/5 hover:bg-white/10'
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Explanatory Policy Card */}
          <div className="p-3 rounded-xl bg-violet-950/20 border border-violet-800/30 text-slate-300 text-xs space-y-1">
            <p className="font-semibold text-violet-300 flex items-center gap-1.5">
              <span>Policy Enforcement Rule:</span>
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              • Students scanning on or before <strong>{endTime}</strong> will be marked as <strong className="text-emerald-400">PRESENT</strong>.
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              • Students scanning after <strong>{endTime}</strong> will be tagged as <strong className="text-amber-400">LATE ENTRY</strong>.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-lg shadow-violet-600/30 flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Saving Window…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save Window Timings
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

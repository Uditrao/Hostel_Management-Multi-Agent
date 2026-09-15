/**
 * NlpCommandPage.jsx
 * ==================
 * Natural Language Inventory Command Console (Phase 7C).
 * Accepts conversational stock updates in English, Hindi, or Hinglish,
 * parses actions via Groq LLM / offline engine, mutates inventory,
 * and displays an interactive audit log.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Terminal,
  Send,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Layers,
  ArrowRight,
  HelpCircle,
  Plus,
  Minus,
  Sliders,
  History
} from 'lucide-react'
import { nourishApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const EXAMPLE_COMMANDS = [
  'aaj humne 10 kilo chawal bana liye h',
  'Added 25kg rice and 10L milk delivered by vendor',
  '20 packet bread aa gaya',
  'Set sugar stock to 15kg after audit',
  '5kg potatoes spoiled / kharab ho gaye',
  'Used 8L cooking oil for dinner service',
]

export default function NlpCommandPage() {
  const [command, setCommand] = useState('')
  const [executing, setExecuting] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch command logs
  const loadLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingLogs(true)
    else setRefreshing(true)

    try {
      const res = await nourishApi.getCommandLogs(20)
      if (res.data?.success) {
        setLogs(res.data.logs || [])
      }
    } catch (err) {
      console.error('Error fetching command logs:', err)
    } finally {
      setLoadingLogs(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  // Execute NLP command
  const handleExecute = async (e) => {
    if (e) e.preventDefault()
    const trimmed = command.trim()
    if (!trimmed) return

    setExecuting(true)
    setErrorMsg(null)
    setLastResult(null)

    try {
      const res = await nourishApi.executeCommand(trimmed)
      if (res.data?.success) {
        setLastResult(res.data)
        setCommand('')
        loadLogs(true)
      } else {
        setErrorMsg(res.data?.clarification_needed || 'Could not interpret command.')
      }
    } catch (err) {
      console.error('Command execution error:', err)
      setErrorMsg(
        err.detail ||
        err.response?.data?.detail ||
        'Command execution failed. Please verify syntax.'
      )
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
              NOURISH Conversational AI
            </span>
            <span className="badge badge-emerald text-[11px]">
              <Sparkles className="w-3 h-3" />
              Groq LLM & Offline Rule Parser
            </span>
          </div>
          <h1 className="page-header">Natural Language Command Console</h1>
          <p className="page-subheader">
            Update mess inventory by speaking or typing naturally in English, Hindi, or Hinglish.
          </p>
        </div>

        <button
          onClick={() => loadLogs(true)}
          disabled={refreshing}
          className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Syncing…' : 'Refresh Logs'}
        </button>
      </div>

      {/* Terminal Command Console Card */}
      <div className="card border border-cyan-500/30 p-6 space-y-5 shadow-glow-cyan/10">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-mono text-xs font-bold">
              &gt;_
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Interactive Command Line</h2>
              <p className="text-xs text-slate-500">Multilingual: English • हिन्दी • Hinglish</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Parser Ready
          </div>
        </div>

        {/* Quick Example Chips */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Click Example Command to Test:
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_COMMANDS.map((eg, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCommand(eg)}
                className="text-xs px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 transition-all text-left font-mono"
              >
                &ldquo;{eg}&rdquo;
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <form onSubmit={handleExecute} className="space-y-3">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-mono font-bold text-sm">
              &gt;
            </div>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Type an inventory action, e.g. 'aaj 15 kilo chawal bana liye'..."
              className="w-full pl-9 pr-28 py-3.5 rounded-2xl glass text-slate-100 placeholder-slate-500 border border-white/10 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 transition-all font-mono text-xs sm:text-sm"
            />
            <button
              type="submit"
              disabled={executing || !command.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary py-2 px-4 text-xs flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-glow-cyan disabled:opacity-40"
            >
              {executing ? <LoadingSpinner size="sm" /> : <Send className="w-3.5 h-3.5" />}
              {executing ? 'Parsing…' : 'Execute'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            Press <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 font-mono">Enter</kbd> to run. Supports additions, usage/spoilage deductions, and audit stock sets.
          </p>
        </form>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 flex items-start gap-3 text-xs animate-slide-up">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <p className="font-semibold text-sm mb-0.5">Could Not Parse Command</p>
              <p>{errorMsg}</p>
            </div>
          </div>
        )}
      </div>

      {/* Execution Result Banner / Actions Card */}
      {lastResult && (
        <div className="card border border-emerald-500/30 p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="badge badge-emerald text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Parsed & Executed Successfully
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {lastResult.summary || `${lastResult.actions_count || 1} action(s) committed`}
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Raw: &ldquo;{lastResult.raw_command}&rdquo;
            </span>
          </div>

          {/* Action pills */}
          <div className="space-y-2.5">
            {(lastResult.results || lastResult.actions || []).map((resItem, idx) => {
              const act = resItem.action || resItem
              const itemData = resItem.item
              const actionType = act.action?.toLowerCase()

              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-950/60 border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        actionType === 'add'
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                          : actionType === 'set'
                          ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400'
                          : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {actionType === 'add' ? (
                        <Plus className="w-4 h-4" />
                      ) : actionType === 'set' ? (
                        <Sliders className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-100 capitalize">
                          {act.item_name}
                        </span>
                        <span className="badge badge-slate text-[10px] uppercase font-mono">
                          {actionType} {act.quantity} {act.unit}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {act.note || 'Applied to live stock table'}
                      </p>
                    </div>
                  </div>

                  {itemData && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">
                        New Stock Level:{' '}
                        <strong className="text-emerald-300 font-mono text-sm">
                          {itemData.quantity} {itemData.unit}
                        </strong>
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        Item ID: #{String(itemData.id).slice(0, 8)}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Audit History Log Card */}
      <div className="card border border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            Natural Language Command Audit Trail
          </h3>
          <span className="text-xs text-slate-500 font-mono">{logs.length} logged events</span>
        </div>

        {loadingLogs ? (
          <div className="py-12 flex justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            No NLP commands logged yet. Type a command above to record your first update.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="pb-3 pl-2">Timestamp</th>
                  <th className="pb-3">Raw Command</th>
                  <th className="pb-3">Parsed Actions Summary</th>
                  <th className="pb-3 text-right pr-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {logs.map((log) => {
                  const d = new Date(log.created_at)
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3 pl-2 text-slate-400 font-mono whitespace-nowrap">
                        {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                        {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 font-mono text-slate-200 max-w-xs truncate">
                        &ldquo;{log.raw_command}&rdquo;
                      </td>
                      <td className="py-3 text-slate-400">
                        {log.parsed_actions
                          ? Array.isArray(log.parsed_actions)
                            ? log.parsed_actions
                                .map((a) => `${a.action} ${a.quantity || ''}${a.unit || ''} ${a.item_name || a.item || ''}`)
                                .join(', ')
                            : JSON.stringify(log.parsed_actions)
                          : '—'}
                      </td>
                      <td className="py-3 text-right pr-2">
                        <span
                          className={`badge text-[10px] ${
                            log.status === 'success' || !log.status
                              ? 'badge-emerald'
                              : 'badge-rose'
                          }`}
                        >
                          {log.status || 'Applied'}
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

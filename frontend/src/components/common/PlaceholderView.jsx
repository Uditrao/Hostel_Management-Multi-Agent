/**
 * PlaceholderView.jsx
 * Clean, consistent coming-soon placeholder card for portal sub-pages
 * scheduled for Phase 7B (Student), Phase 7C (Mess), and Phase 7D (Warden).
 */
import { Sparkles } from 'lucide-react'

export default function PlaceholderView({
  title,
  subtitle,
  agentName,
  phase,
  icon: Icon,
  accentColor = 'cyan', // 'cyan' | 'amber' | 'violet' | 'rose'
}) {
  const accentMap = {
    cyan: {
      tag: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      iconBox: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
      border: 'border-cyan-500/20',
      glow: 'shadow-glow-cyan',
      highlight: 'text-cyan-400',
    },
    amber: {
      tag: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      iconBox: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      border: 'border-amber-500/20',
      glow: 'shadow-glow-amber',
      highlight: 'text-amber-400',
    },
    violet: {
      tag: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
      iconBox: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
      border: 'border-violet-500/20',
      glow: 'shadow-glow-violet',
      highlight: 'text-violet-400',
    },
    rose: {
      tag: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      iconBox: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
      border: 'border-rose-500/20',
      glow: 'shadow-glow-rose',
      highlight: 'text-rose-400',
    },
  }

  const s = accentMap[accentColor] || accentMap.cyan

  return (
    <div className="animate-fade-in max-w-4xl mx-auto py-8">
      {/* Page Title */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${s.tag}`}>
            {agentName || 'System'}
          </span>
          <span className="text-xs text-slate-500 font-mono">Scheduled: {phase}</span>
        </div>
        <h1 className="page-header">{title}</h1>
        <p className="page-subheader">{subtitle}</p>
      </div>

      {/* Feature placeholder card */}
      <div className={`card border ${s.border} p-8 text-center flex flex-col items-center justify-center min-h-[300px]`}>
        <div className={`w-16 h-16 rounded-2xl border ${s.iconBox} flex items-center justify-center mb-5 ${s.glow}`}>
          {Icon ? <Icon className="w-8 h-8" /> : <Sparkles className="w-8 h-8" />}
        </div>

        <h3 className="text-lg font-semibold text-slate-100 mb-2">
          {title} Module
        </h3>

        <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
          The foundation and role routing for this module are configured in <span className="font-semibold text-slate-200">Phase 7A</span>.
          The interactive UI and live agent integration will be activated in <span className={`font-semibold ${s.highlight}`}>{phase}</span>.
        </p>

        <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-500 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          <span>FastAPI Backend Ready</span>
          <span>•</span>
          <span>Role Guard Protected</span>
        </div>
      </div>
    </div>
  )
}

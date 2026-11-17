/**
 * PlaceholderView.jsx
 * Clean, consistent enterprise placeholder view for future modules.
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
  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-[#141b2a] border border-white/[0.08] rounded-lg p-8 sm:p-10 shadow-card text-center">
        {Icon && (
          <div className="w-12 h-12 rounded-lg bg-[#1e293b] border border-white/[0.1] flex items-center justify-center mx-auto mb-4 text-slate-200">
            <Icon className="w-6 h-6 text-blue-400" />
          </div>
        )}

        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono uppercase bg-white/[0.04] border border-white/[0.08] text-slate-400 mb-3">
          <span>{agentName || 'System'}</span>
          {phase && <span>• {phase}</span>}
        </div>

        <h2 className="text-xl font-bold text-slate-100 mb-2">{title}</h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          {subtitle || 'This operational module is being prepared according to the facility roadmap.'}
        </p>
      </div>
    </div>
  )
}

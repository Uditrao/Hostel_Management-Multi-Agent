/**
 * LoadingSpinner.jsx
 * Multi-size refined animated spinner for enterprise dashboard interfaces.
 */
import { cn } from '../../lib/utils'

export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-7 h-7 border-2',
    lg: 'w-10 h-10 border-[2.5px]',
    xl: 'w-14 h-14 border-3',
  }

  return (
    <div
      className={cn(
        'rounded-full border-slate-700 border-t-blue-500 animate-spin',
        sizes[size] ?? sizes.md,
        className
      )}
      role="status"
      aria-label="Loading"
    />
  )
}

/**
 * Full-page loading state with centered spinner and clear status message.
 */
export function FullPageSpinner({ message = 'Loading system telemetry…' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-[#0b0f17]">
      <div className="p-3 rounded-lg bg-[#141b2a] border border-white/[0.08] shadow-panel">
        <LoadingSpinner size="lg" />
      </div>
      {message && (
        <p className="text-xs font-mono text-slate-400">{message}</p>
      )}
    </div>
  )
}

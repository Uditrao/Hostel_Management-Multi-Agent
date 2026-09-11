/**
 * LoadingSpinner.jsx
 * Multi-size premium animated spinner used throughout the app.
 */
import { cn } from '../../lib/utils'

export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-[3px]',
    xl: 'w-20 h-20 border-4',
  }

  return (
    <div
      className={cn(
        'rounded-full border-slate-700 border-t-violet-500 animate-spin',
        sizes[size] ?? sizes.md,
        className
      )}
      role="status"
      aria-label="Loading"
    />
  )
}

/**
 * Full-page loading state with centered spinner and optional message.
 */
export function FullPageSpinner({ message = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-hostel">
      {/* Outer glow ring */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl animate-pulse" />
        <LoadingSpinner size="xl" />
      </div>
      {message && (
        <p className="text-sm text-slate-500 animate-pulse">{message}</p>
      )}
    </div>
  )
}

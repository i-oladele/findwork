import type { ReactNode } from 'react'
import { Screen } from '../chrome/Screen'
import { StatusBar } from '../chrome/StatusBar'

/** Shown while the initial auth session is resolving. */
export function FullScreenLoader() {
  return (
    <Screen>
      <StatusBar />
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <Spinner />
        <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-muted-2">Loading</span>
      </div>
    </Screen>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block w-6 h-6 rounded-full border-2 border-line border-t-brand animate-spin ${className}`}
    />
  )
}

/** Skeleton block for list/card placeholders while data loads. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-line-soft rounded-lg animate-pulse ${className}`} />
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 items-center bg-white border border-line rounded-2xl p-4">
          <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon = 'ph-tray',
  title,
  body,
  action,
}: {
  icon?: string
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-14">
      <i className={`ph ${icon} text-[34px] text-muted-3`} />
      <div className="mt-3.5 font-display font-semibold text-[17px] text-ink">{title}</div>
      {body && <p className="mt-1.5 text-[14.5px] leading-[1.5] text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-14">
      <i className="ph ph-warning-circle text-[34px] text-brand" />
      <div className="mt-3.5 font-display font-semibold text-[17px] text-ink">Something went wrong</div>
      <p className="mt-1.5 text-[14.5px] leading-[1.5] text-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 h-11 px-6 bg-ink rounded-xl text-[15px] font-semibold text-cream"
        >
          Try again
        </button>
      )}
    </div>
  )
}

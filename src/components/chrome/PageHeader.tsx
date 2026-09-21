import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatusBar } from './StatusBar'

/**
 * Goes back through history when there is somewhere to go back to, and to
 * `fallback` otherwise — a screen opened from a notification or a shared
 * link has no history, and "back" should still land somewhere sensible.
 */
export function BackButton({
  fallback,
  icon = 'arrow-left',
  tone = 'dark',
  className = '',
}: {
  fallback: string
  icon?: 'arrow-left' | 'x'
  tone?: 'dark' | 'light'
  className?: string
}) {
  const navigate = useNavigate()
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0

  return (
    <button
      type="button"
      aria-label={icon === 'x' ? 'Close' : 'Back'}
      onClick={() => (canGoBack ? navigate(-1) : navigate(fallback, { replace: true }))}
      className={`inline-flex items-center justify-center w-11 h-11 -ml-2.5 ${
        tone === 'light' ? 'text-cream' : 'text-ink'
      } ${className}`}
    >
      <i className={`ph-bold ph-${icon} ${icon === 'x' ? 'text-xl' : 'text-[22px]'}`} />
    </button>
  )
}

/** Status-bar spacer, back button and title: the top of most screens. */
export function PageHeader({
  title,
  back,
  icon,
  right,
}: {
  title: ReactNode
  back: string
  icon?: 'arrow-left' | 'x'
  right?: ReactNode
}) {
  return (
    <>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <BackButton fallback={back} icon={icon} />
            <span className="font-display font-semibold text-[17px] text-ink truncate">{title}</span>
          </div>
          {right}
        </div>
      </div>
    </>
  )
}

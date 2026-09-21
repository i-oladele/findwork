import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from '../system/States'

type Variant = 'primary' | 'secondary' | 'ghost'

type ButtonProps = {
  variant?: Variant
  icon?: string
  children: ReactNode
  className?: string
  to?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  /** Shows a spinner in place of the label and blocks further taps. */
  loading?: boolean
}

// w-full matters: a <button> sizes to its own text even when it is a flex
// container, while the <Link> variant (an <a>) stretches. Without this the
// same component rendered two different widths depending on whether it was
// given `to` or `onClick`.
const base =
  'w-full flex items-center justify-center gap-2 h-14 rounded-xl font-semibold text-[17px] font-sans transition-colors'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  // no text color here — callers set it via className since this variant is
  // used on both light (text-ink) and dark (text-cream) backgrounds
  secondary: 'border-[1.5px] border-ink-line hover:border-brand',
  ghost: 'text-muted h-12 font-semibold',
}

export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  to,
  onClick,
  type = 'button',
  disabled,
  loading,
}: ButtonProps) {
  const inactive = disabled || loading
  const classes = `${base} ${variants[variant]} ${inactive ? 'opacity-50 pointer-events-none' : ''} ${className}`
  const content = loading ? (
    <Spinner className="w-5 h-5 border-current/30 border-t-current" />
  ) : (
    <>
      {icon && <i className={`ph-bold ph-${icon} text-[17px]`} />}
      {children}
    </>
  )

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {content}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={inactive} className={classes}>
      {content}
    </button>
  )
}

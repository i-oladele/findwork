import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

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
}

const base =
  'flex items-center justify-center gap-2 h-14 rounded-xl font-semibold text-[17px] font-sans transition-colors'

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
}: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`
  const content = (
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
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {content}
    </button>
  )
}

import type { ReactNode, CSSProperties } from 'react'
import { Link } from 'react-router-dom'

type CardProps = {
  children: ReactNode
  to?: string
  onClick?: () => void
  active?: boolean
  className?: string
  style?: CSSProperties
}

export function Card({ children, to, onClick, active, className = '', style }: CardProps) {
  const classes = `block bg-white rounded-2xl border ${
    active ? 'border-[1.5px] border-brand' : 'border-line'
  } ${className}`

  if (to) {
    return (
      <Link to={to} className={classes} style={style}>
        {children}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${classes} text-left w-full`} style={style}>
        {children}
      </button>
    )
  }
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  )
}

import type { ReactNode } from 'react'

export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 ${className}`}>
      {children}
    </div>
  )
}

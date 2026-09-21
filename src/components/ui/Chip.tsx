import type { ReactNode } from 'react'

type ChipProps = {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  icon?: string
}

export function Chip({ children, active, onClick, icon }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-[15px] py-2 text-[13.5px] whitespace-nowrap transition-colors ${
        active ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
      }`}
    >
      {icon && <i className={`ph-fill ph-${icon} text-sm`} />}
      {children}
    </button>
  )
}

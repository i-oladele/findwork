import type { ReactNode } from 'react'

type Tone = 'success' | 'warning' | 'danger' | 'neutral'

const tones: Record<Tone, string> = {
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  danger: 'bg-danger-bg text-danger',
  neutral: 'bg-cream text-text-soft',
}

export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}
    >
      {icon && <i className={`ph-fill ph-${icon}`} />}
      {children}
    </span>
  )
}

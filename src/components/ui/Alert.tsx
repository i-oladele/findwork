import type { ReactNode } from 'react'

const tones = {
  error: { box: 'bg-danger-bg', icon: 'ph-warning-circle text-danger', text: 'text-danger' },
  success: { box: 'bg-success-bg', icon: 'ph-check-circle text-success-text', text: 'text-success-text' },
  info: { box: 'bg-white border border-line', icon: 'ph-info text-muted-2', text: 'text-text-soft' },
} as const

export function Alert({
  tone = 'error',
  children,
  className = '',
}: {
  tone?: keyof typeof tones
  children: ReactNode
  className?: string
}) {
  const t = tones[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 ${t.box} ${className}`}
    >
      <i className={`ph-fill ${t.icon} text-base relative top-0.5`} />
      <div className={`text-[13.5px] leading-[1.45] ${t.text}`}>{children}</div>
    </div>
  )
}

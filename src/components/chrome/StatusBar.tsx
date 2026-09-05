type StatusBarProps = {
  tone?: 'light' | 'dark'
  className?: string
  transparent?: boolean
}

/** The 9:41 / signal-wifi-battery row every screen in the source opens with. */
export function StatusBar({ tone = 'dark', className = '', transparent = false }: StatusBarProps) {
  const color = tone === 'light' ? 'text-cream' : 'text-ink'
  return (
    <div
      className={`h-11 flex items-center justify-between px-[22px] font-mono text-xs ${color} ${
        transparent ? 'bg-gradient-to-b from-cream/90 to-cream/0' : ''
      } ${className}`}
    >
      <span>9:41</span>
      <span className="flex items-center gap-1.5">
        <i className="ph-fill ph-cell-signal-full text-[13px]" />
        <i className="ph-fill ph-wifi-high text-[13px]" />
        <i className="ph-fill ph-battery-full text-sm" />
      </span>
    </div>
  )
}

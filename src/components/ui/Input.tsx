import type { ReactNode } from 'react'

type InputProps = {
  label?: string
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  icon?: string
  type?: string
  hint?: string
  trailing?: ReactNode
}

export function Input({ label, value, onChange, placeholder, icon, type = 'text', hint, trailing }: InputProps) {
  return (
    <div>
      {label && (
        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">{label}</div>
      )}
      <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
        {icon && <i className={`ph ph-${icon} text-[19px] text-brand`} />}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-[16px] text-ink bg-transparent outline-none placeholder:text-muted-2"
        />
        {trailing}
      </div>
      {hint && <p className="mt-2 text-[13px] leading-[1.45] text-muted-2">{hint}</p>}
    </div>
  )
}

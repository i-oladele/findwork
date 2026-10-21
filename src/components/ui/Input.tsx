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
  /** Lets phones and password managers fill the field: "email", "name", … */
  autoComplete?: string
  autoCapitalize?: 'none' | 'words' | 'sentences'
}

export function Input({
  label,
  value,
  onChange,
  placeholder,
  icon,
  type = 'text',
  hint,
  trailing,
  autoComplete,
  autoCapitalize,
}: InputProps) {
  return (
    // A <label> around the field names it for screen readers and makes the label tappable.
    <label className="block">
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
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          spellCheck={type === 'email' ? false : undefined}
          className="flex-1 min-w-0 text-[16px] text-ink bg-transparent outline-none placeholder:text-muted-2"
        />
        {trailing}
      </div>
      {hint && <span className="block mt-2 text-[13px] leading-[1.45] text-muted-2">{hint}</span>}
    </label>
  )
}

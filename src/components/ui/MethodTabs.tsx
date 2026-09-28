import type { AuthMethod } from '../../lib/authContext'

const LABELS: Record<AuthMethod, string> = { phone: 'Phone', email: 'Email' }

/** Phone or email, for signing up, signing in and resetting a password. */
export function MethodTabs({
  value,
  onChange,
  className = '',
}: {
  value: AuthMethod
  onChange: (method: AuthMethod) => void
  className?: string
}) {
  return (
    <div role="tablist" className={`flex gap-1.5 bg-line-soft rounded-lg p-1 ${className}`}>
      {(['phone', 'email'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={value === m}
          onClick={() => onChange(m)}
          className={`flex-1 h-10 rounded-md text-[14.5px] ${
            value === m ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'
          }`}
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  )
}

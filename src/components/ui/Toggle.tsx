export function Toggle({
  on,
  onChange,
  label,
  size = 'md',
  disabled,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
  size?: 'md' | 'sm'
  disabled?: boolean
}) {
  const w = size === 'md' ? 'w-[52px] h-[30px]' : 'w-11 h-[26px]'
  const knob = size === 'md' ? 'w-6 h-6' : 'w-5 h-5'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex-none ${w} rounded-full flex items-center p-[3px] transition-colors disabled:opacity-50 ${
        on ? 'bg-success justify-end' : 'bg-line justify-start'
      }`}
    >
      <span className={`${knob} rounded-full bg-white`} />
    </button>
  )
}

type StatusBarProps = {
  /** Kept for call-site compatibility with the design's light/dark headers. */
  tone?: 'light' | 'dark'
  className?: string
}

/**
 * Top spacer that clears the phone's own status bar and notch. The design
 * mocked a "9:41" bar here; on a real phone that sat underneath the real
 * one. With viewport-fit=cover (index.html) env() reports the notch height
 * when installed to the home screen, and 0 in a normal browser tab.
 */
export function StatusBar({ className = '' }: StatusBarProps) {
  return <div aria-hidden className={`h-[max(12px,env(safe-area-inset-top))] ${className}`} />
}

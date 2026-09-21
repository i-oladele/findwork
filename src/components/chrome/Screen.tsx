import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'

type ScreenProps = {
  children: ReactNode
  /** Tailwind background class for the screen canvas, e.g. "bg-cream" or "bg-ink". */
  background?: string
  bottomNav?: 'customer' | 'provider' | 'none'
}

/**
 * Every route renders inside this: a mobile-width column, centered on wide
 * viewports, full height, with the bottom tab bar (if any) pinned to the
 * bottom of the viewport. The status bar and any dark header band are part
 * of each screen's own content (they vary in height/background per screen
 * in the source), not this wrapper.
 */
export function Screen({ children, background = 'bg-cream', bottomNav = 'none' }: ScreenProps) {
  return (
    <div className="min-h-screen w-full flex justify-center bg-canvas">
      <div className={`w-full max-w-[480px] min-h-screen flex flex-col ${background}`}>
        <div className="flex-1">{children}</div>
        {bottomNav !== 'none' && <BottomNav mode={bottomNav} />}
      </div>
    </div>
  )
}

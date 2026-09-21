import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Last line of defence: without this, any render-time throw blanks the whole
 * app with no message. Swap the console call for Sentry when observability
 * lands.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[findwork] uncaught render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen w-full flex justify-center bg-canvas">
        <div className="w-full max-w-[480px] min-h-screen bg-cream flex flex-col items-center justify-center text-center px-8">
          <i className="ph ph-warning-octagon text-[38px] text-brand" />
          <h1 className="mt-4 font-display font-bold text-[24px] tracking-[-0.02em] text-ink">
            The app hit a problem
          </h1>
          <p className="mt-2 text-[15px] leading-[1.55] text-muted">
            Sorry — something broke while loading this screen. Reloading usually fixes it.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 w-full overflow-x-auto text-left font-mono text-[11px] leading-[1.5] text-brand-deep bg-white border border-line rounded-lg p-3">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.assign('/home')}
            className="mt-6 h-12 px-7 bg-ink rounded-xl text-[15px] font-semibold text-cream"
          >
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}

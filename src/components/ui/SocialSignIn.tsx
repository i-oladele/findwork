import { useState } from 'react'
import { Alert } from './Alert'
import { useAuth } from '../../lib/authContext'
import { friendlyError } from '../../lib/supabase'
import { OAUTH_LABELS, oauthProviders } from '../../lib/oauth'

/**
 * The "or continue with" row. Renders nothing at all when no provider is
 * configured, so sign-in never offers a button that cannot work.
 */
export function SocialSignIn() {
  const { signInWithOAuth } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (oauthProviders.length === 0) return null

  async function start(provider: (typeof oauthProviders)[number]) {
    setError(null)
    setBusy(provider)
    try {
      // Redirects away from the app; the session is picked up on return.
      await signInWithOAuth(provider)
    } catch (err) {
      setError(friendlyError(err))
      setBusy(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3.5 my-6">
        <span className="flex-1 h-px bg-line" />
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted">or</span>
        <span className="flex-1 h-px bg-line" />
      </div>

      {error && <Alert className="mb-3">{error}</Alert>}

      <div className="flex gap-3">
        {oauthProviders.map((provider) => (
          <button
            key={provider}
            onClick={() => start(provider)}
            disabled={busy !== null}
            className="flex-1 flex items-center justify-center gap-2 h-[52px] bg-white border border-line rounded-xl text-[15px] font-semibold text-ink disabled:opacity-50"
          >
            <i className={`${OAUTH_LABELS[provider].icon} text-lg`} />
            {OAUTH_LABELS[provider].label}
          </button>
        ))}
      </div>
    </>
  )
}

import { useState } from 'react'
import { Screen } from '../chrome/Screen'
import { StatusBar } from '../chrome/StatusBar'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { ErrorState, FullScreenLoader } from './States'
import { useAuth } from '../../lib/authContext'
import { useMfaFactors, useRecoverMfa, useVerifyMfa } from '../../lib/api/mfa'
import { friendlyError } from '../../lib/supabase'

/** The second step of signing in: a code from the authenticator app, or a recovery code. */
export function MfaChallenge() {
  const { signOut } = useAuth()
  const factors = useMfaFactors()
  const verify = useVerifyMfa()
  const recover = useRecoverMfa()
  const [code, setCode] = useState('')
  const [recovering, setRecovering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (factors.isLoading) return <FullScreenLoader />
  const factor = factors.data?.[0]
  if (factors.isError || !factor) {
    return <Screen><StatusBar /><ErrorState message="We could not load your sign-in settings." onRetry={() => void factors.refetch()} /></Screen>
  }
  const pending = verify.isPending || recover.isPending
  const ready = recovering ? code.replace(/[^0-9a-fA-F]/g, '').length === 10 : code.replace(/\D/g, '').length === 6

  async function submit() {
    if (!ready || pending) return
    setError(null)
    try {
      if (recovering) await recover.mutateAsync(code)
      else await verify.mutateAsync({ factorId: factor!.id, code })
    } catch (err) {
      setError(recovering ? friendlyError(err) : 'That code is not right. Check your authenticator app and try again.')
    }
  }

  return (
    <Screen>
      <StatusBar />
      <form className="px-[22px] pt-10 pb-8" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <i className="ph-fill ph-shield-check text-[34px] text-brand" />
        <h1 className="mt-4 font-display font-bold text-[26px] leading-tight text-ink">
          {recovering ? 'Enter a recovery code' : 'Enter your sign-in code'}
        </h1>
        <p className="mt-2 text-[15px] leading-[1.5] text-muted">
          {recovering
            ? 'Use one of the codes you saved when you turned on two-step sign-in. It turns two-step sign-in off so you can set it up again.'
            : 'Open your authenticator app and enter the 6-digit code for FindWork.'}
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={recovering ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoFocus
          aria-label={recovering ? 'Recovery code' : 'Sign-in code'}
          placeholder={recovering ? 'ab12c-34de5' : '123456'}
          className="mt-6 w-full bg-white border-[1.5px] border-ink rounded-lg h-[58px] px-4 font-display font-bold text-2xl tracking-[0.12em] text-ink outline-none placeholder:text-muted-4"
        />
        {error && <Alert className="mt-4">{error}</Alert>}
        <Button type="submit" disabled={!ready} loading={pending} className="mt-5">Continue</Button>
        <button type="button" className="mt-4 min-h-11 text-[14.5px] font-semibold text-brand" onClick={() => { setRecovering(!recovering); setCode(''); setError(null) }}>
          {recovering ? 'Use my authenticator app instead' : 'I cannot use my authenticator app'}
        </button>
        <button type="button" className="block min-h-11 text-[14.5px] text-muted" onClick={() => void signOut()}>Sign out</button>
      </form>
    </Screen>
  )
}

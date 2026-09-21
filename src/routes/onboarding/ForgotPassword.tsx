import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/Alert'
import { useAuth } from '../../lib/authContext'
import { friendlyError } from '../../lib/supabase'
import { toE164 } from '../../lib/phone'

/**
 * Email accounts get a reset link. Phone accounts get a one-time code, which
 * signs them in on /verify; they then land on /reset-password to choose a
 * new password.
 */
export function ForgotPassword() {
  const navigate = useNavigate()
  const { requestPasswordReset } = useAuth()
  const [method, setMethod] = useState<'phone' | 'email'>('email')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = method === 'phone' ? phone.trim().length >= 10 : email.includes('@')

  async function submit() {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      if (method === 'phone') {
        const e164 = toE164(phone)
        await requestPasswordReset({ method, phone: e164 })
        navigate('/verify', { state: { method, phone: e164, next: '/reset-password' } })
      } else {
        await requestPasswordReset({ method, email: email.trim() })
        setSent(true)
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <PageHeader title="Reset your password" back="/signin" />
      <div className="px-6 pt-4">
        {sent ? (
          <Alert tone="success">
            If an account uses {email.trim()}, a reset link is on its way. Open it on this phone to choose a
            new password.
          </Alert>
        ) : (
          <>
            <p className="text-[15.5px] leading-[1.55] text-muted">
              Tell us how you signed up and we will help you back in.
            </p>
            <div className="flex gap-1.5 bg-line-soft rounded-lg p-1 mt-5">
              {(['email', 'phone'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`flex-1 h-10 rounded-md text-[14.5px] ${
                    method === m ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'
                  }`}
                >
                  {m === 'email' ? 'Email' : 'Phone'}
                </button>
              ))}
            </div>
            <div className="mt-5">
              {method === 'email' ? (
                <Input label="Email address" value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
              ) : (
                <Input label="Phone number" value={phone} onChange={setPhone} placeholder="803 412 9087" icon="phone" />
              )}
            </div>
            {error && <Alert className="mt-4">{error}</Alert>}
            <Button onClick={submit} disabled={!canSubmit} loading={busy} className="mt-6 w-full">
              {method === 'email' ? 'Send reset link' : 'Send code'}
            </Button>
          </>
        )}
      </div>
    </Screen>
  )
}

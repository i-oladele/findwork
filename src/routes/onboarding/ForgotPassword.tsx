import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/Alert'
import { MethodTabs } from '../../components/ui/MethodTabs'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { phoneUnavailable, useAuth, type AuthMethod } from '../../lib/authContext'
import { friendlyError } from '../../lib/supabase'
import { emptyPhone, isPhoneNumber, toE164, type PhoneValue } from '../../lib/phone'

/**
 * Email accounts get a reset link. Phone accounts get a one-time code, which
 * signs them in on /verify; they then land on /reset-password to choose a
 * new password.
 */
export function ForgotPassword() {
  const navigate = useNavigate()
  const { requestPasswordReset } = useAuth()
  const [method, setMethod] = useState<AuthMethod>('phone')
  const [phone, setPhone] = useState<PhoneValue>(emptyPhone)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = method === 'phone' ? isPhoneNumber(phone) : email.includes('@')

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
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
      if (method === 'phone' && phoneUnavailable(err)) setMethod('email')
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
          <form onSubmit={submit} noValidate>
            <p className="text-[15.5px] leading-[1.55] text-muted">
              Tell us how you signed up and we will help you back in.
            </p>
            <MethodTabs value={method} onChange={setMethod} className="mt-5" />
            <div className="mt-5">
              {method === 'email' ? (
                <Input
                  label="Email address"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                />
              ) : (
                <PhoneInput value={phone} onChange={setPhone} />
              )}
            </div>
            {error && <Alert className="mt-4">{error}</Alert>}
            <Button type="submit" disabled={!canSubmit} loading={busy} className="mt-6 w-full">
              {method === 'email' ? 'Send reset link' : 'Send code'}
            </Button>
          </form>
        )}
      </div>
    </Screen>
  )
}

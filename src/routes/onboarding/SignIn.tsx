import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { MethodTabs } from '../../components/ui/MethodTabs'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Spinner } from '../../components/system/States'
import { SocialSignIn } from '../../components/ui/SocialSignIn'
import { phoneUnavailable, useAuth, type AuthMethod } from '../../lib/authContext'
import { usePasskeysAvailable } from '../../lib/api'
import { destination, onboardingPath } from '../../lib/destination'
import { passkeyCancelled, passkeyErrorMessage } from '../../lib/passkeys'
import { friendlyError } from '../../lib/supabase'
import { emptyPhone, isPhoneNumber, toE164, type PhoneValue } from '../../lib/phone'

export function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, resendOtp, signInWithPasskey } = useAuth()
  const { data: passkeysOn } = usePasskeysAvailable()
  const [fingerprintBusy, setFingerprintBusy] = useState(false)
  // Sign-up hands over what was typed when the account turns out to exist.
  const handedOver = location.state as { method?: AuthMethod; email?: string; phone?: PhoneValue } | null

  // Phone first, as on sign-up, unless sign-up handed over an email.
  const [method, setMethod] = useState<AuthMethod>(handedOver?.method ?? 'phone')
  const [phone, setPhone] = useState<PhoneValue>(handedOver?.phone ?? emptyPhone)
  const [email, setEmail] = useState(handedOver?.email ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    password.length > 0 && (method === 'phone' ? isPhoneNumber(phone) : email.trim().length > 0)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    const identity = {
      method,
      phone: method === 'phone' ? toE164(phone) : undefined,
      email: method === 'email' ? email.trim() : undefined,
    }
    try {
      await signIn({ ...identity, password })
      navigate(destination(), { replace: true })
    } catch (err) {
      // Signed up but never entered the code: send a fresh one and finish
      // confirming, rather than stopping at "confirm your email first".
      const code = (err as { code?: string }).code
      if (code === 'email_not_confirmed' || code === 'phone_not_confirmed') {
        await resendOtp(identity).catch(() => undefined)
        // They never reached the role picker, so confirming continues there.
        navigate('/verify', { state: { ...identity, next: onboardingPath() } })
        return
      }
      if (method === 'phone' && phoneUnavailable(err)) setMethod('email')
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  // No number or email needed: the phone offers the account it saved.
  async function fingerprint() {
    setFingerprintBusy(true)
    setError(null)
    try {
      await signInWithPasskey()
      navigate(destination(), { replace: true })
    } catch (err) {
      setError(passkeyErrorMessage(err, 'sign-in'))
      if (!passkeyCancelled(err)) console.warn('Passkey sign-in failed', err)
    } finally {
      setFingerprintBusy(false)
    }
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-6 pt-2">
        <Link to="/welcome" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
          <i className="ph-bold ph-arrow-left text-[22px]" />
        </Link>
        <h2 className="mt-3.5 font-display font-bold text-[34px] leading-[1.05] tracking-[-0.03em] text-ink">
          Welcome back
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">Sign in to pick up where you left off.</p>

        <form onSubmit={submit} noValidate>
          <MethodTabs value={method} onChange={setMethod} className="mt-[26px]" />

          <div className="mt-[22px] space-y-4">
            {method === 'phone' ? (
              <PhoneInput value={phone} onChange={setPhone} />
            ) : (
              <Input
                label="Email address"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
              />
            )}

            <div>
              <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Password</div>
              <div className="flex items-center justify-between bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="flex-1 text-[16px] tracking-[0.05em] text-ink bg-transparent outline-none placeholder:text-muted-2 placeholder:tracking-normal"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'} text-[19px] text-muted-2`} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <Link to="/forgot-password" className="text-[14px] font-semibold text-brand-hover">
              Forgot password?
            </Link>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 mt-4 bg-brand/8 border border-brand/25 rounded-xl px-4 py-3"
            >
              <i className="ph-fill ph-warning-circle text-[18px] text-brand relative top-px" />
              <span className="text-[14px] leading-[1.45] text-brand-deep">{error}</span>
            </div>
          )}

          <Button type="submit" disabled={!canSubmit || busy} className="mt-[26px]">
            {busy ? <Spinner className="w-5 h-5 border-white/40 border-t-white" /> : 'Sign in'}
          </Button>
        </form>

        {passkeysOn && (
          <Button
            variant="secondary"
            icon="fingerprint"
            onClick={fingerprint}
            loading={fingerprintBusy}
            className="mt-3 text-ink border-line"
          >
            Sign in with fingerprint
          </Button>
        )}

        <SocialSignIn />

        <p className="mt-6 mb-8 text-center text-[14.5px] text-muted">
          New here?{' '}
          <Link to="/signup" className="text-brand-hover font-semibold">
            Create an account
          </Link>
        </p>
      </div>
    </Screen>
  )
}

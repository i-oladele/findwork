import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { MethodTabs } from '../../components/ui/MethodTabs'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Spinner } from '../../components/system/States'
import { SocialSignIn } from '../../components/ui/SocialSignIn'
import { phoneUnavailable, useAuth, type AuthMethod } from '../../lib/authContext'
import { destination } from '../../lib/destination'
import { friendlyError } from '../../lib/supabase'
import { emptyPhone, isPhoneNumber, toE164, type PhoneValue } from '../../lib/phone'

export function SignUp() {
  const navigate = useNavigate()
  const { signUp } = useAuth()

  // Phone first: it is how most people here expect to sign up.
  const [method, setMethod] = useState<AuthMethod>('phone')
  const [phone, setPhone] = useState<PhoneValue>(emptyPhone)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordValid = password.length >= 8 && /\d/.test(password)
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    passwordValid &&
    (method === 'phone' ? isPhoneNumber(phone) : email.trim().length > 0)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)

    const e164 = toE164(phone)
    const cleanEmail = email.trim()

    try {
      const { needsVerification } = await signUp({
        method,
        phone: method === 'phone' ? e164 : undefined,
        email: method === 'email' ? cleanEmail : undefined,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })

      if (!needsVerification) {
        // Signed straight in: signUp has already pointed this at onboarding.
        navigate(destination(), { replace: true })
        return
      }

      // Verify needs to know which identity to confirm the code against.
      navigate('/verify', {
        state: { method, phone: method === 'phone' ? e164 : undefined, email: method === 'email' ? cleanEmail : undefined },
      })
    } catch (err) {
      // No SMS provider on the project yet: move them to email, name kept.
      if (method === 'phone' && phoneUnavailable(err)) setMethod('email')
      setError(friendlyError(err))
    } finally {
      setBusy(false)
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
          Create your account
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">
          It takes a minute. We will {method === 'phone' ? 'text' : 'email'} you a code to confirm it is you.
        </p>

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
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First name"
                value={firstName}
                onChange={setFirstName}
                autoComplete="given-name"
                autoCapitalize="words"
              />
              <Input
                label="Last name"
                value={lastName}
                onChange={setLastName}
                autoComplete="family-name"
                autoCapitalize="words"
              />
            </div>
            <div>
              <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Password</div>
              <div className="flex items-center justify-between bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
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
              <p className="mt-2 text-[13px] leading-[1.45] text-muted-2">
                At least 8 characters, with one number.
              </p>
            </div>
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
            {busy ? <Spinner className="w-5 h-5 border-white/40 border-t-white" /> : 'Create my account'}
          </Button>
        </form>

        <p className="mt-3.5 text-center text-[13px] leading-[1.5] text-muted-2">
          By creating an account you agree to our{' '}
          <Link to="/legal/terms" className="underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/legal/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>

        <SocialSignIn />

        <p className="mt-6 mb-8 text-center text-[14.5px] text-muted">
          Already have an account?{' '}
          <Link
            to="/signin"
            state={{ method, email: email.trim() || undefined, phone: phone.number.trim() ? phone : undefined }}
            className="text-brand-hover font-semibold"
          >
            Sign in
          </Link>
        </p>
      </div>
    </Screen>
  )
}

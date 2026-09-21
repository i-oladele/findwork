import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/system/States'
import { SocialSignIn } from '../../components/ui/SocialSignIn'
import { useAuth } from '../../lib/authContext'
import { friendlyError } from '../../lib/supabase'
import { toE164 } from '../../lib/phone'

export function SignUp() {
  const navigate = useNavigate()
  const { signUp } = useAuth()

  // Email by default: phone needs an SMS provider configured on the Supabase
  // project (and costs per message). Switch back to 'phone' once it is set up —
  // phone-first is the right default for Nigerian users.
  const [method, setMethod] = useState<'phone' | 'email'>('email')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordValid = password.length >= 8 && /\d/.test(password)
  const canSubmit =
    fullName.trim().length > 0 &&
    passwordValid &&
    (method === 'phone' ? phone.trim().length > 0 : email.trim().length > 0)

  async function submit() {
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
        fullName: fullName.trim(),
      })

      if (!needsVerification) {
        navigate('/role', { replace: true })
        return
      }

      // Verify needs to know which identity to confirm the code against.
      navigate('/verify', {
        state: { method, phone: method === 'phone' ? e164 : undefined, email: method === 'email' ? cleanEmail : undefined },
      })
    } catch (err) {
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
          We will send a 6-digit code to confirm it is you.
        </p>

        <div className="flex gap-1.5 bg-line-soft rounded-lg p-1 mt-[26px]">
          <button
            onClick={() => setMethod('phone')}
            className={`flex-1 h-10 rounded-md text-[14.5px] ${
              method === 'phone' ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'
            }`}
          >
            Phone
          </button>
          <button
            onClick={() => setMethod('email')}
            className={`flex-1 h-10 rounded-md text-[14.5px] ${
              method === 'email' ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'
            }`}
          >
            Email
          </button>
        </div>

        <div className="mt-[22px] space-y-4">
          {method === 'phone' ? (
            <div>
              <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">
                Phone number
              </div>
              <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
                <span className="flex items-center gap-1.5 pr-3 border-r border-line-soft text-[15.5px] font-semibold text-ink">
                  +234
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="803 412 9087"
                  inputMode="tel"
                  autoComplete="tel"
                  className="flex-1 text-[16px] text-ink bg-transparent outline-none placeholder:text-muted-2"
                />
              </div>
            </div>
          ) : (
            <Input label="Email address" value={email} onChange={setEmail} placeholder="Email address" type="email" />
          )}
          <Input label="Full name" value={fullName} onChange={setFullName} placeholder="Full name" />
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
              <button type="button" onClick={() => setShowPassword((v) => !v)}>
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

        <Button onClick={submit} disabled={!canSubmit || busy} className="mt-[26px]">
          {busy ? <Spinner className="w-5 h-5 border-white/40 border-t-white" /> : 'Send my code'}
        </Button>

        <SocialSignIn />

        <p className="mt-6 mb-8 text-center text-[14.5px] text-muted">
          Already have an account?{' '}
          <Link to="/signin" className="text-brand-hover font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </Screen>
  )
}

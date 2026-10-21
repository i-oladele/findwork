import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/system/States'
import { Toggle } from '../../components/ui/Toggle'
import { useAuth } from '../../lib/authContext'
import { usePasskeysAvailable } from '../../lib/api'
import { destination } from '../../lib/destination'
import { passkeyCancelled, passkeyErrorMessage } from '../../lib/passkeys'
import { friendlyError } from '../../lib/supabase'
import { formatPhone } from '../../lib/phone'
import { useT } from '../../lib/i18n'

type VerifyState = { method: 'phone' | 'email'; phone?: string; email?: string; next?: string }

const RESEND_SECONDS = 45
const PENDING_KEY = 'fw.verify'

/** What is being confirmed, kept so a refresh does not send them back to sign-up. */
function pendingVerification(state: unknown): VerifyState | null {
  const fromNav = state as VerifyState | null
  try {
    if (fromNav?.method) {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(fromNav))
      return fromNav
    }
    const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as VerifyState | null
    return saved?.method ? saved : null
  } catch {
    return fromNav?.method ? fromNav : null
  }
}

function forgetPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Nothing to clean up.
  }
}

export function Verify() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { session, verifyOtp, resendOtp, registerPasskey } = useAuth()
  const [pending] = useState(() => pendingVerification(location.state))
  const { data: passkeysOn } = usePasskeysAvailable()

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS)
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  // Fingerprint sign-in needs a signed-in account, which only exists once the
  // code is accepted. So the toggle records the choice, and the fingerprint
  // is asked for as a second step, on a tap of its own.
  const [wantsFingerprint, setWantsFingerprint] = useState(false)
  const [afterCode, setAfterCode] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const confirming = useRef(false)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft])

  // The email also carries a link. Tapped on this device, it signs this tab
  // in too (the session is shared), so carry on without waiting for a code.
  useEffect(() => {
    if (session && pending?.method === 'email' && !confirming.current) {
      forgetPending()
      navigate(pending.next ?? destination(), { replace: true })
    }
  }, [session, pending, navigate])

  // Arriving here directly (refresh, deep link) leaves us with no identity to
  // verify against, so send the user back rather than failing on submit.
  if (!pending) return <Navigate to="/signup" replace />

  const code = digits.join('')
  const target = pending.method === 'phone' ? formatPhone(pending.phone ?? '') : pending.email
  // Offered when joining, not in the middle of resetting a password.
  const offerFingerprint = passkeysOn === true && pending.next !== '/reset-password'

  function setDigit(i: number, raw: string) {
    const value = raw.replace(/\D/g, '')
    if (!value) {
      setDigits((d) => d.map((x, idx) => (idx === i ? '' : x)))
      return
    }
    // Pasting the whole code into any box fills the row.
    if (value.length > 1) {
      const chars = value.slice(0, 6).split('')
      setDigits((d) => d.map((x, idx) => chars[idx] ?? x))
      inputs.current[Math.min(chars.length, 5)]?.focus()
      return
    }
    setDigits((d) => d.map((x, idx) => (idx === i ? value : x)))
    if (i < 5) inputs.current[i + 1]?.focus()
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
  }

  async function submit() {
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    confirming.current = true
    try {
      await verifyOtp({ method: pending!.method, phone: pending!.phone, email: pending!.email, token: code })
      forgetPending()
      // A password reset by phone continues to /reset-password; sign-up to
      // onboarding, which signUp recorded as the destination.
      const next = pending!.next ?? destination()
      if (offerFingerprint && wantsFingerprint) setAfterCode(next)
      else navigate(next, { replace: true })
    } catch (err) {
      confirming.current = false
      setError(friendlyError(err))
      setDigits(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setBusy(false)
    }
  }

  async function turnOnFingerprint() {
    setEnrolling(true)
    setError(null)
    try {
      await registerPasskey()
      navigate(afterCode!, { replace: true })
    } catch (err) {
      setError(passkeyErrorMessage(err, 'turn-on'))
      if (!passkeyCancelled(err)) console.warn('Passkey registration failed', err)
    } finally {
      setEnrolling(false)
    }
  }

  if (afterCode) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-6 pt-[70px]">
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-bg">
            <i className="ph-fill ph-fingerprint text-[34px] text-success" />
          </span>
          <h2 className="mt-6 font-display font-bold text-[34px] leading-[1.05] tracking-[-0.03em] text-ink">
            {t('Code confirmed')}
          </h2>
          <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">
            {t('Now use your fingerprint or face to turn on fingerprint sign-in. Next time, that is all it takes.')}
          </p>
          {error && (
            <div role="alert" className="flex items-start gap-2.5 mt-5">
              <i className="ph-fill ph-warning-circle text-[18px] text-brand relative top-px" />
              <span className="text-[14px] leading-[1.45] text-brand-deep">{error}</span>
            </div>
          )}
          <Button onClick={turnOnFingerprint} loading={enrolling} icon="fingerprint" className="mt-7">
            {t('Use my fingerprint')}
          </Button>
          <button
            type="button"
            onClick={() => navigate(afterCode, { replace: true })}
            className="w-full h-12 mt-2 text-[15px] font-semibold text-muted"
          >
            {t('Skip for now')}
          </button>
        </div>
      </Screen>
    )
  }

  async function resend() {
    if (secondsLeft > 0) return
    setError(null)
    try {
      await resendOtp({ method: pending!.method, phone: pending!.phone, email: pending!.email })
      setSecondsLeft(RESEND_SECONDS)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-6 pt-2">
        <Link to="/signup" onClick={forgetPending} aria-label={t('Back')} className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
          <i className="ph-bold ph-arrow-left text-[22px]" />
        </Link>
        <h2 className="mt-3.5 font-display font-bold text-[34px] leading-[1.05] tracking-[-0.03em] text-ink">
          {t('Enter your code')}
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">
          We sent a 6-digit code to <span className="font-semibold text-ink">{target}</span>.{' '}
          <Link to="/signup" onClick={forgetPending} className="text-brand-hover font-semibold">
            {t('Change')}
          </Link>
        </p>
        {pending.method === 'email' && (
          <p className="mt-2 text-[14px] leading-[1.5] text-muted-2">
            {t('You can also tap the link in that email. Not there after a minute? Check spam and promotions.')}
          </p>
        )}

        <div className="flex gap-2.5 mt-8">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              autoFocus={i === 0}
              aria-label={`Digit ${i + 1}`}
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              className={`flex-1 min-w-0 h-16 flex items-center justify-center bg-white border-[1.5px] rounded-lg font-display font-bold text-[26px] text-center text-ink outline-none ${
                error ? 'border-brand' : d ? 'border-ink' : 'border-line'
              }`}
              maxLength={6}
              inputMode="numeric"
            />
          ))}
        </div>

        {error ? (
          <div role="alert" className="flex items-start gap-2.5 mt-5">
            <i className="ph-fill ph-warning-circle text-[18px] text-brand relative top-px" />
            <span className="text-[14px] leading-[1.45] text-brand-deep">{error}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-5 text-[14.5px] text-muted">
            <i className="ph ph-clock-countdown text-[17px] text-muted-2" />
            {secondsLeft > 0 ? (
              <span>
                Resend code in 0:{secondsLeft.toString().padStart(2, '0')}
              </span>
            ) : (
              <button onClick={resend} className="text-brand-hover font-semibold">
                {t('Resend code')}
              </button>
            )}
          </div>
        )}

        <Button onClick={submit} disabled={code.length !== 6 || busy} className="mt-7">
          {busy ? <Spinner className="w-5 h-5 border-white/40 border-t-white" /> : 'Verify and continue'}
        </Button>

        {offerFingerprint && (
          <div className="flex items-center gap-3 mt-7 bg-white border border-line rounded-2xl p-[18px_20px]">
            <i className="ph-fill ph-fingerprint text-2xl text-success" />
            {/* A non-breaking hyphen: "sign-" and "in" must not split across lines. */}
            <div className="flex-1 font-display font-semibold text-[16px] text-ink">{t('Turn on fingerprint sign‑in')}</div>
            <Toggle label={t('Turn on fingerprint sign-in')} on={wantsFingerprint} onChange={setWantsFingerprint} />
          </div>
        )}
      </div>
    </Screen>
  )
}

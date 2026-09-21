import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import { friendlyError } from '../../lib/supabase'
import { toLocal } from '../../lib/phone'

type VerifyState = { method: 'phone' | 'email'; phone?: string; email?: string; next?: string }

const RESEND_SECONDS = 45

export function Verify() {
  const navigate = useNavigate()
  const location = useLocation()
  const { verifyOtp, resendOtp } = useAuth()
  const pending = location.state as VerifyState | null

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS)
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft])

  // Arriving here directly (refresh, deep link) leaves us with no identity to
  // verify against, so send the user back rather than failing on submit.
  if (!pending) return <Navigate to="/signup" replace />

  const code = digits.join('')
  const target = pending.method === 'phone' ? `+234 ${toLocal(pending.phone ?? '')}` : pending.email

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
    try {
      await verifyOtp({ method: pending!.method, phone: pending!.phone, email: pending!.email, token: code })
      // A password reset by phone continues to /reset-password; sign-up to /role.
      navigate(pending!.next ?? '/role', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
      setDigits(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setBusy(false)
    }
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
        <Link to="/signup" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
          <i className="ph-bold ph-arrow-left text-[22px]" />
        </Link>
        <h2 className="mt-3.5 font-display font-bold text-[34px] leading-[1.05] tracking-[-0.03em] text-ink">
          Enter your code
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">
          Sent to {target}.{' '}
          <Link to="/signup" className="text-brand-hover font-semibold">
            Change
          </Link>
        </p>

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
                Resend code
              </button>
            )}
          </div>
        )}

        <Button onClick={submit} disabled={code.length !== 6 || busy} className="mt-7">
          {busy ? <Spinner className="w-5 h-5 border-white/40 border-t-white" /> : 'Verify and continue'}
        </Button>

        <div className="flex items-start gap-3 mt-7 bg-white border border-line rounded-2xl p-[18px_20px]">
          <i className="ph-fill ph-fingerprint text-2xl text-success relative top-0.5" />
          <div>
            <div className="font-display font-semibold text-[16px] text-ink">Turn on fingerprint sign-in</div>
            <p className="mt-1 text-[14px] leading-[1.45] text-muted">
              Available once the app is installed on your phone.
            </p>
          </div>
        </div>
      </div>
    </Screen>
  )
}

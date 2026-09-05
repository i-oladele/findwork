import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'

export function Verify() {
  const [digits, setDigits] = useState(['4', '1', '9', '2', '', ''])

  function setDigit(i: number, v: string) {
    const next = [...digits]
    next[i] = v.slice(-1)
    setDigits(next)
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
          Sent to +234 803 412 9087.{' '}
          <Link to="/signup" className="text-brand-hover font-semibold">
            Change
          </Link>
        </p>

        <div className="flex gap-2.5 mt-8">
          {digits.map((d, i) => (
            <input
              key={i}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              className={`flex-1 min-w-0 h-16 flex items-center justify-center bg-white border-[1.5px] rounded-lg font-display font-bold text-[26px] text-center text-ink outline-none ${
                i === 3 ? 'border-brand' : d ? 'border-ink' : 'border-line'
              }`}
              maxLength={1}
              inputMode="numeric"
            />
          ))}
        </div>

        <div className="flex items-center gap-2 mt-5 text-[14.5px] text-muted">
          <i className="ph ph-clock-countdown text-[17px] text-muted-2" />
          <span>Resend code in 0:42</span>
        </div>

        <Button to="/role" className="mt-7">
          Verify and continue
        </Button>

        <div className="flex items-start gap-3 mt-7 bg-white border border-line rounded-2xl p-[18px_20px]">
          <i className="ph-fill ph-fingerprint text-2xl text-success relative top-0.5" />
          <div>
            <div className="font-display font-semibold text-[16px] text-ink">Turn on fingerprint sign-in</div>
            <p className="mt-1 text-sm leading-[1.5] text-muted">
              Skip the password next time. You can change this later in Settings.
            </p>
          </div>
        </div>
      </div>
    </Screen>
  )
}

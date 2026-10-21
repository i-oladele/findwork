import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { useStartTopUp, useWalletSummary } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira, parseNaira } from '../../lib/format'
import { goToPaystack } from '../../lib/payRedirect'
import { useT } from '../../lib/i18n'

const PRESETS = [5000, 10000, 25000, 50000]
const MIN = 100
const MAX = 1_000_000


export function AddMoney() {
  const t = useT()
  const [params] = useSearchParams()
  const suggested = Number(params.get('amount')) || 0
  const returnTo = params.get('return')
  const { data: wallet } = useWalletSummary()
  const start = useStartTopUp()
  // Round a shortfall up to the next ₦100 so it clears the gap with change to spare.
  const [raw, setRaw] = useState(suggested > 0 ? String(Math.ceil(suggested / 100) * 100) : '25000')
  const [error, setError] = useState<string | null>(null)

  const amount = parseNaira(raw)
  const valid = amount >= MIN && amount <= MAX

  async function pay() {
    setError(null)
    try {
      const { reference, authorization_url } = await start.mutateAsync(amount)
      goToPaystack(reference, authorization_url, returnTo)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title={t('Add money')} back={returnTo ?? '/wallet'} icon="x" />
      <div className="px-[22px] pb-6">
        <div className="text-center mt-[26px]">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">{t('Amount')}</div>
          <div className="flex items-center justify-center mt-2.5 font-display font-bold text-[48px] tracking-[-0.03em] text-ink">
            <span>₦</span>
            <input
              value={raw ? Number(parseNaira(raw)).toLocaleString('en-NG') : ''}
              onChange={(e) => setRaw(e.target.value)}
              inputMode="numeric"
              aria-label={t('Amount in naira')}
              className="w-[220px] bg-transparent outline-none text-center"
            />
          </div>
          <div className="text-sm text-muted mt-1.5">New balance {formatNaira((wallet?.balance ?? 0) + amount)}</div>
        </div>

        <div className="flex gap-2.5 mt-6">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setRaw(String(p))}
              className={`flex-1 h-11 flex items-center justify-center rounded-full text-sm font-semibold ${
                amount === p ? 'bg-ink text-white' : 'bg-white border border-line text-ink'
              }`}
            >
              {formatNaira(p)}
            </button>
          ))}
        </div>

        <div className="flex items-start gap-3 bg-white border border-line rounded-2xl p-4 mt-6">
          <i className="ph-fill ph-shield-check text-[22px] text-success" />
          <div>
            <div className="text-[15px] font-semibold text-ink">{t('Pay securely with Paystack')}</div>
            <p className="text-[13.5px] leading-[1.5] text-muted mt-1">
              {t('Card, bank transfer or USSD. Your wallet is credited as soon as Paystack confirms the payment — FindWork never sees your card details.')}
            </p>
          </div>
        </div>

        {!valid && raw && (
          <Alert className="mt-4">
            Enter an amount between {formatNaira(MIN)} and {formatNaira(MAX)}.
          </Alert>
        )}
        {error && <Alert className="mt-4">{error}</Alert>}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
        <Button onClick={pay} disabled={!valid} loading={start.isPending} className="w-full">
          Pay {formatNaira(amount)}
        </Button>
      </div>
    </Screen>
  )
}

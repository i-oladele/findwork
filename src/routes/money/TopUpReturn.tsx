import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/system/States'
import { useVerifyTopUp, type TopUpStatus } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { RETURN_KEY } from './AddMoney'

const MAX_TRIES = 6

function storedReturn(reference: string | null): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? 'null') as { reference: string; returnTo: string | null } | null
    // Only same-app paths, never a full URL: this came from a query string.
    if (saved && saved.reference === reference && saved.returnTo?.startsWith('/')) return saved.returnTo
  } catch {
    // Ignore: fall back to the wallet.
  }
  return null
}

/**
 * Paystack sends the user back here with ?reference=…. The server asks
 * Paystack whether it succeeded and credits the wallet; a bank transfer can
 * take a little while to confirm, so it retries for about half a minute.
 */
export function TopUpReturn() {
  const [params] = useSearchParams()
  const reference = params.get('reference') ?? params.get('trxref')
  const { mutateAsync: verify } = useVerifyTopUp()
  const [result, setResult] = useState<TopUpStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const returnTo = storedReturn(reference)

  useEffect(() => {
    if (!reference) return
    // Safe to run more than once (StrictMode mounts twice in development):
    // crediting is idempotent on the reference, and a cancelled run's
    // result is simply ignored.
    let cancelled = false

    async function poll(attempt: number) {
      try {
        const res = await verify(reference!)
        if (cancelled) return
        if (res.status === 'pending' && attempt < MAX_TRIES) {
          setTimeout(() => poll(attempt + 1), 5000)
          return
        }
        setResult(res)
      } catch (err) {
        if (!cancelled) setError(friendlyError(err))
      }
    }
    poll(1)
    return () => {
      cancelled = true
    }
  }, [reference, verify])

  const done = result?.status === 'success'
  const failed = result?.status === 'failed'
  const stillPending = result?.status === 'pending'

  return (
    <Screen background="bg-ink">
      <StatusBar tone="light" />
      <div className="px-7 pt-[80px]">
        {!reference ? (
          <Message icon="ph-question" tone="bg-ink-soft" title="No payment to check" body="Start again from your wallet." />
        ) : error ? (
          <Message icon="ph-warning" tone="bg-brand" title="We could not check this payment" body={`${error} If money left your account, it will reach your wallet once Paystack confirms it.`} />
        ) : done ? (
          <Message icon="ph-check" tone="bg-success" title={`${formatNaira(result.amount)} added`} body="It is in your wallet now." />
        ) : failed ? (
          <Message icon="ph-x" tone="bg-brand" title="Payment did not go through" body="Nothing was taken. You can try again." />
        ) : stillPending ? (
          <Message
            icon="ph-hourglass"
            tone="bg-warning"
            title="Still waiting for your bank"
            body="Transfers can take a few minutes. We will add the money and notify you as soon as it lands."
          />
        ) : (
          <div className="flex flex-col items-start gap-5">
            <Spinner className="w-10 h-10 border-ink-line border-t-brand" />
            <h2 className="font-display font-bold text-[30px] leading-[1.1] text-cream">Confirming your payment…</h2>
          </div>
        )}
      </div>
      {(result || error || !reference) && (
        <div className="px-7 pt-10">
          {done && returnTo ? (
            <Button to={returnTo} className="w-full">
              Continue where you were
            </Button>
          ) : failed ? (
            <Button to="/wallet/add" className="w-full">
              Try again
            </Button>
          ) : null}
          <Button to="/wallet" variant="secondary" className="mt-3 w-full text-cream">
            Go to wallet
          </Button>
        </div>
      )}
    </Screen>
  )
}

function Message({ icon, tone, title, body }: { icon: string; tone: string; title: string; body: string }) {
  return (
    <>
      <span className={`inline-flex items-center justify-center w-[76px] h-[76px] rounded-full ${tone}`}>
        <i className={`ph-bold ${icon} text-[36px] text-white`} />
      </span>
      <h2 className="mt-8 font-display font-bold text-[34px] leading-[1.08] tracking-[-0.03em] text-cream">{title}</h2>
      <p className="mt-4 text-[16px] leading-[1.55] text-muted-3">{body}</p>
    </>
  )
}

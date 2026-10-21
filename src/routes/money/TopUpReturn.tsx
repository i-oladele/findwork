import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/system/States'
import { useVerifyTopUp, type TopUpStatus } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { RETURN_KEY } from '../../lib/payRedirect'
import { useCart } from '../../store/cart'
import { useT } from '../../lib/i18n'

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
 * Paystack whether it succeeded and settles it: credits the wallet, and for
 * a checkout or a plan places the order or changes the plan. A bank transfer
 * can take a little while to confirm, so it retries for about half a minute.
 */
export function TopUpReturn() {
  const t = useT()
  const [params] = useSearchParams()
  const reference = params.get('reference') ?? params.get('trxref')
  const { mutateAsync: verify } = useVerifyTopUp()
  const [result, setResult] = useState<TopUpStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const returnTo = storedReturn(reference)
  const clearCart = useCart((s) => s.clear)

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

  const ordered = result?.status === 'success' && result.purpose === 'checkout' && Boolean(result.outcome?.order_ids?.length)
  const planChanged = result?.status === 'success' && result.purpose === 'plan' && Boolean(result.outcome?.plan)
  // Paid, but the order or plan could not follow: the money is in the wallet.
  const keptInWallet = result?.status === 'success' && Boolean(result.outcome?.error)
  const done = result?.status === 'success' && !ordered && !planChanged && !keptInWallet
  useEffect(() => {
    if (ordered) clearCart()
  }, [ordered, clearCart])
  const orderIds = result?.outcome?.order_ids ?? []
  const failed = result?.status === 'failed'
  const stillPending = result?.status === 'pending'
  const refunding = result?.status === 'refund_due' || result?.status === 'refunded'

  return (
    <Screen background="bg-ink">
      <StatusBar tone="light" />
      <div className="px-7 pt-[80px]">
        {!reference ? (
          <Message icon="ph-question" tone="bg-ink-soft" title={t('No payment to check')} body={t('Start again from your wallet.')} />
        ) : error ? (
          <Message icon="ph-warning" tone="bg-brand" title={t('We could not check this payment')} body={`${error} If money left your account, it will reach your wallet once Paystack confirms it.`} />
        ) : ordered ? (
          <Message icon="ph-check" tone="bg-success" title={t('Order placed')} body={`${formatNaira(result!.amount)} paid by card. The seller has been told, and the money is held until your order arrives.`} />
        ) : planChanged ? (
          <Message icon="ph-check" tone="bg-success" title={t('Your plan is active')} body={`${formatNaira(result!.amount)} paid by card. It renews monthly; you can change how in Plan and billing.`} />
        ) : keptInWallet ? (
          <Message icon="ph-wallet" tone="bg-warning" title={t('Your payment is in your wallet')}
            body={`${formatNaira(result!.amount)} arrived, but we could not ${result!.purpose === 'checkout' ? 'place your order' : 'change your plan'}: ${friendlyError({ message: result!.outcome!.error })} Nothing is lost; you can pay from your wallet.`} />
        ) : done ? (
          <Message icon="ph-check" tone="bg-success" title={`${formatNaira(result.amount)} added`} body={t('It is in your wallet now.')} />
        ) : failed ? (
          <Message icon="ph-x" tone="bg-brand" title={t('Payment did not go through')} body={t('Nothing was taken. You can try again.')} />
        ) : refunding ? (
          <Message
            icon="ph-arrow-u-up-left"
            tone="bg-warning"
            title={t('This payment is being refunded')}
            body={t('The account it was for was closed before the money arrived, so we are sending it back to where it came from.')}
          />
        ) : stillPending ? (
          <Message
            icon="ph-hourglass"
            tone="bg-warning"
            title={t('Still waiting for your bank')}
            body={t('Transfers can take a few minutes. We will add the money and notify you as soon as it lands.')}
          />
        ) : (
          <div className="flex flex-col items-start gap-5">
            <Spinner className="w-10 h-10 border-ink-line border-t-brand" />
            <h2 className="font-display font-bold text-[30px] leading-[1.1] text-cream">{t('Confirming your payment…')}</h2>
          </div>
        )}
      </div>
      {(result || error || !reference) && (
        <div className="px-7 pt-10">
          {ordered ? (
            <Button to={orderIds.length === 1 ? `/order/${orderIds[0]}` : '/orders'} className="w-full">
              See your order{orderIds.length === 1 ? '' : 's'}
            </Button>
          ) : planChanged ? (
            <Button to="/billing" className="w-full">{t('Plan and billing')}</Button>
          ) : keptInWallet ? (
            <Button to={result!.purpose === 'checkout' ? '/checkout' : '/plans'} className="w-full">
              {result!.purpose === 'checkout' ? 'Back to checkout' : 'Back to plans'}
            </Button>
          ) : done && returnTo ? (
            <Button to={returnTo} className="w-full">
              {t('Continue where you were')}
            </Button>
          ) : failed ? (
            <Button to="/wallet/add" className="w-full">
              {t('Try again')}
            </Button>
          ) : null}
          <Button to="/wallet" variant="secondary" className="mt-3 w-full text-cream">
            {t('Go to wallet')}
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

import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { QueryState } from '../../components/system/QueryState'
import { usePaystackAvailable, usePlans, useStartPayment, useSubscribe, useSubscription, useWalletSummary } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { goToPaystack } from '../../lib/payRedirect'

export function Plans() {
  const plans = usePlans()
  const { data: subscription } = useSubscription()
  const { data: wallet } = useWalletSummary()
  const subscribe = useSubscribe()
  const startCard = useStartPayment()
  const { data: cardsOn } = usePaystackAvailable()
  const [keepCard, setKeepCard] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const current = subscription?.plan ?? 'free'
  const balance = wallet?.balance ?? 0

  async function choose(planId: string, price: number) {
    setError(null)
    setDone(null)
    if (price > 0 && !window.confirm(`Charge ${formatNaira(price)} from your wallet now, then monthly?`)) return
    try {
      await subscribe.mutateAsync(planId)
      setDone(planId)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  // The first month is paid by card; with keepCard, each renewal is charged to it too.
  async function payByCard(planId: string) {
    setError(null)
    setDone(null)
    try {
      const { reference, authorization_url } = await startCard.mutateAsync({ purpose: 'plan', plan: planId, save_card: keepCard })
      goToPaystack(reference, authorization_url, '/billing')
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Plans" back="/provider" />
      <div className="px-[22px] pb-8">
        <p className="mt-3 text-[15px] leading-[1.55] text-muted">
          A plan lowers what FindWork takes from each job you complete, and lifts the cap on live services. Billed
          monthly, by card or from your wallet.
        </p>
        <div className="text-[13px] text-muted-2 mt-1.5">Wallet balance {formatNaira(balance)}</div>

        {done && (
          <Alert tone="success" className="mt-4">
            You are on the {plans.data?.find((p) => p.id === done)?.name} plan now.
          </Alert>
        )}
        {error && <Alert className="mt-4">{error}</Alert>}

        <QueryState query={plans} errorMessage="We could not load plans." skeletonRows={3}>
          {(list) =>
            list.map((p) => {
              const isCurrent = current === p.id
              const short = Math.max(0, p.price - balance)
              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-2xl p-[18px] mt-4 ${p.id === 'pro' ? 'border-[1.5px] border-brand' : 'border border-line'}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-display font-bold text-[19px] text-ink">{p.name}</span>
                    <span className="font-display font-bold text-xl text-ink">
                      {p.price === 0 ? 'Free' : formatNaira(p.price)}
                      {p.price > 0 && <span className="text-xs font-normal text-muted-2">/month</span>}
                    </span>
                  </div>
                  <div className="text-[13.5px] text-muted mt-1">
                    {Math.round(Number(p.commission_rate) * 100)}% of each completed job ·{' '}
                    {p.listing_limit === null ? 'unlimited services' : `${p.listing_limit} live services`}
                  </div>
                  <div className="mt-3.5 space-y-2">
                    {p.features.map((f) => (
                      <div key={f} className="flex items-center gap-2.5">
                        <i className="ph-fill ph-check-circle text-base text-success" />
                        <span className="text-[14px] text-text-soft">{f}</span>
                      </div>
                    ))}
                  </div>
                  {isCurrent ? (
                    <div className="flex items-center justify-center w-full h-12 mt-4 rounded-lg bg-cream text-[15px] font-semibold text-muted">
                      Current plan
                    </div>
                  ) : p.price > 0 ? (
                    <div className="mt-4 space-y-2">
                      {cardsOn && <Button onClick={() => payByCard(p.id)} loading={startCard.isPending} disabled={startCard.isPending || subscribe.isPending} className="w-full h-12">
                        Pay {formatNaira(p.price)} by card
                      </Button>}
                      {short > 0 ? (
                        <Button to={`/wallet/add?amount=${short}&return=/plans`} variant="secondary" className="w-full text-ink h-12">
                          {cardsOn ? 'Or add' : 'Add'} {formatNaira(short)} to your wallet
                        </Button>
                      ) : (
                        <button onClick={() => choose(p.id, p.price)} disabled={subscribe.isPending || startCard.isPending}
                          className="flex items-center justify-center w-full h-12 rounded-lg border border-ink text-ink text-[15px] font-semibold disabled:opacity-50">
                          Pay from wallet
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => choose(p.id, p.price)}
                      disabled={subscribe.isPending}
                      className={`flex items-center justify-center w-full h-12 mt-4 rounded-lg text-[15px] font-semibold disabled:opacity-50 ${
                        p.id === 'pro' ? 'bg-brand text-white' : 'border border-ink text-ink'
                      }`}
                    >
                      Switch to {p.name}
                    </button>
                  )}
                </div>
              )
            })
          }
        </QueryState>

        {cardsOn && <label className="flex items-start gap-3 mt-5 text-[14px] leading-[1.45] text-text-soft">
          <input type="checkbox" checked={keepCard} onChange={(e) => setKeepCard(e.target.checked)} className="mt-1 w-4 h-4 accent-brand" />
          <span>When I pay by card, keep the card to renew the plan each month. You can remove it at any time in Plan and billing.</span>
        </label>}
        <p className="mt-4 text-[13px] leading-[1.5] text-muted-2">
          A plan renews monthly from your saved card, or from your wallet if there is no card or it is declined. If
          neither can cover a renewal, the account moves back to Free and nothing else happens.
        </p>
      </div>
    </Screen>
  )
}

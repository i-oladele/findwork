import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TransactionRow } from '../../components/ui/TransactionRow'
import { usePaymentCards, usePlans, useRemovePaymentCard, useSetPlanCard, useSubscription, useTransactions } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDate, formatNaira } from '../../lib/format'

export function Billing() {
  const { data: subscription } = useSubscription()
  const { data: plans } = usePlans()
  const { data: ledger } = useTransactions(200)

  const planId = subscription?.plan ?? 'free'
  const plan = plans?.find((p) => p.id === planId)
  const history = (ledger ?? []).filter((t) => t.kind === 'subscription')
  const paid = Boolean(plan && plan.price > 0)

  return (
    <Screen>
      <PageHeader title="Plan and billing" back="/settings" />
      <div className="px-[22px] pb-8">
        <div className="bg-ink rounded-2xl p-[18px] mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">Current plan</div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="font-display font-bold text-2xl text-cream">{plan?.name ?? 'Free'}</span>
            <span className="font-display font-bold text-lg text-cream">
              {!plan || plan.price === 0 ? 'Free' : `${formatNaira(plan.price)}/month`}
            </span>
          </div>
          {plan && (
            <div className="text-[13px] text-muted-3 mt-1.5">
              {Math.round(Number(plan.commission_rate) * 100)}% fee on completed jobs
              {subscription?.renews_at ? ` · renews ${formatDate(subscription.renews_at)}` : ''}
            </div>
          )}
          <Link
            to="/plans"
            className="flex items-center justify-center h-11 mt-4 border-[1.5px] border-ink-line rounded-lg font-semibold text-[14.5px] text-cream"
          >
            Change plan
          </Link>
        </div>

        {paid && <RenewsFrom cardId={subscription?.card_id ?? null} />}

        <SectionLabel className="mt-5 mb-2.5">Billing history</SectionLabel>
        {history.length === 0 ? (
          <div className="bg-white border border-line rounded-2xl p-6 text-center text-sm text-muted">No charges yet.</div>
        ) : (
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            {history.map((t, i) => (
              <TransactionRow key={t.id} t={t} isLast={i === history.length - 1} />
            ))}
          </div>
        )}
      </div>
    </Screen>
  )
}

/** Which saved card the plan renews from, or the wallet. */
function RenewsFrom({ cardId }: { cardId: string | null }) {
  const cards = usePaymentCards()
  const setCard = useSetPlanCard()
  const remove = useRemovePaymentCard()
  const [error, setError] = useState<string | null>(null)
  const run = (p: Promise<unknown>) => { setError(null); p.catch((e) => setError(friendlyError(e))) }
  const list = cards.data ?? []

  return (
    <>
      <SectionLabel className="mt-5 mb-2.5">Renews from</SectionLabel>
      <div className="bg-white border border-line rounded-2xl p-4 space-y-1">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-3 min-h-12">
            <button className="flex flex-1 items-center gap-3 text-left" aria-pressed={cardId === c.id} disabled={setCard.isPending}
              onClick={() => run(setCard.mutateAsync(c.id))}>
              <i className={`ph${cardId === c.id ? '-fill ph-check-circle text-brand' : ' ph-circle text-muted-2'} text-[20px]`} />
              <span className="text-[15px] text-ink capitalize">{(c.brand ?? 'card').trim()} ···· {c.last4}</span>
              {c.exp_month && c.exp_year && <span className="text-[12.5px] text-muted-2">{String(c.exp_month).padStart(2, '0')}/{String(c.exp_year).slice(-2)}</span>}
            </button>
            <button className="min-h-11 text-[13.5px] font-semibold text-muted" disabled={remove.isPending}
              onClick={() => { if (window.confirm(`Remove the card ending ${c.last4}? Renewals then come from your wallet.`)) run(remove.mutateAsync(c.id)) }}>
              Remove
            </button>
          </div>
        ))}
        <button className="flex items-center gap-3 min-h-12 w-full text-left" aria-pressed={cardId === null} disabled={setCard.isPending}
          onClick={() => run(setCard.mutateAsync(null))}>
          <i className={`ph${cardId === null ? '-fill ph-check-circle text-brand' : ' ph-circle text-muted-2'} text-[20px]`} />
          <span className="text-[15px] text-ink">Wallet</span>
        </button>
        {list.length === 0 && <p className="text-[12.5px] text-muted-2">To renew from a card, pay for your next plan change by card and keep the card.</p>}
        {error && <Alert className="mt-2">{error}</Alert>}
      </div>
    </>
  )
}

import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TransactionRow } from '../../components/ui/TransactionRow'
import { usePlans, useSubscription, useTransactions } from '../../lib/api'
import { formatDate, formatNaira } from '../../lib/format'

export function Billing() {
  const { data: subscription } = useSubscription()
  const { data: plans } = usePlans()
  const { data: ledger } = useTransactions(200)

  const planId = subscription?.plan ?? 'free'
  const plan = plans?.find((p) => p.id === planId)
  const history = (ledger ?? []).filter((t) => t.kind === 'subscription')

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

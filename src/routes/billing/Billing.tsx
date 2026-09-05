import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Badge } from '../../components/ui/Badge'
import { plans, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function Billing() {
  const subscription = useAppStore((s) => s.subscription)
  const transactions = useAppStore((s) => s.transactions)
  const plan = plans.find((p) => p.id === subscription.plan)!
  const history = transactions.filter((t) => t.kind === 'subscription')

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/provider" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Billing</span>
        </div>

        <div className="bg-ink rounded-2xl p-[18px] mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">Current plan</div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="font-display font-bold text-2xl text-cream">{plan.name}</span>
            <span className="font-display font-bold text-lg text-cream">
              {plan.price === 0 ? 'Free' : `${formatNaira(plan.price)}/${plan.period}`}
            </span>
          </div>
          <div className="text-[13px] text-muted-3 mt-1.5">Since {subscription.since}</div>
          <Link
            to="/plans"
            className="flex items-center justify-center h-11 mt-4 border-[1.5px] border-ink-line rounded-lg font-semibold text-[14.5px] text-cream"
          >
            Change plan
          </Link>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Billing history</div>
        {history.length === 0 ? (
          <div className="bg-white border border-line rounded-2xl p-6 text-center text-sm text-muted">
            No charges yet.
          </div>
        ) : (
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            {history.map((t, i) => (
              <div key={t.id} className={`flex items-center gap-3.5 p-3.5 ${i < history.length - 1 ? 'border-b border-line-soft' : ''}`}>
                <span className="flex-none inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-warning-bg text-warning-text">
                  <i className="ph-fill ph-receipt text-lg" />
                </span>
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-ink">{t.label}</div>
                  <div className="text-[12.5px] text-muted-2 mt-0.5">{t.time}</div>
                </div>
                <span className="font-display font-bold text-[15px] text-ink">{formatNaira(t.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <Badge tone="neutral">6% → {plan.id === 'free' ? '6%' : plan.id === 'pro' ? '4%' : '2%'} platform fee</Badge>
        </div>
      </div>
    </Screen>
  )
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { plans, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function Plans() {
  const navigate = useNavigate()
  const currentPlan = useAppStore((s) => s.subscription.plan)
  const balance = useAppStore((s) => s.wallet.balance)
  const subscribe = useAppStore((s) => s.subscribe)
  const [error, setError] = useState<string | null>(null)

  function choose(planId: 'free' | 'pro' | 'business') {
    const ok = subscribe(planId)
    if (!ok) {
      setError('Not enough balance in your wallet. Add money first.')
      return
    }
    navigate('/billing')
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/provider" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Upgrade plan</span>
        </div>
        <p className="mt-3 text-[15px] leading-[1.55] text-muted">
          Lower fees, priority placement, more listings. Billed monthly from your wallet.
        </p>
        <div className="text-[13px] text-muted-2 mt-1.5">Wallet balance {formatNaira(balance)}</div>

        {error && (
          <div className="flex items-start gap-2.5 mt-4 bg-danger-bg rounded-lg px-3.5 py-2.5">
            <i className="ph-fill ph-warning-circle text-base text-danger relative top-0.5" />
            <p className="text-[13px] leading-[1.45] text-danger">{error}</p>
          </div>
        )}

        {plans.map((p) => {
          const isCurrent = currentPlan === p.id
          return (
            <div key={p.id} className={`bg-white rounded-2xl p-[18px] mt-4 ${p.id === 'pro' ? 'border-[1.5px] border-brand' : 'border border-line'}`}>
              <div className="flex items-baseline justify-between">
                <span className="font-display font-bold text-[19px] text-ink">{p.name}</span>
                <span className="font-display font-bold text-xl text-ink">
                  {p.price === 0 ? 'Free' : formatNaira(p.price)}
                  {p.price > 0 && <span className="text-xs font-normal text-muted-2">/{p.period}</span>}
                </span>
              </div>
              <div className="mt-3.5 space-y-2">
                {p.features.map((f) => (
                  <div key={f} className="flex items-center gap-2.5">
                    <i className="ph-fill ph-check-circle text-base text-success" />
                    <span className="text-[14px] text-text-soft">{f}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => choose(p.id)}
                disabled={isCurrent}
                className={`flex items-center justify-center w-full h-12 mt-4 rounded-lg text-[15px] font-semibold ${
                  isCurrent
                    ? 'bg-cream text-muted'
                    : p.id === 'pro'
                      ? 'bg-brand text-white'
                      : 'border border-ink text-ink'
                }`}
              >
                {isCurrent ? 'Current plan' : `Switch to ${p.name}`}
              </button>
            </div>
          )
        })}
      </div>
    </Screen>
  )
}

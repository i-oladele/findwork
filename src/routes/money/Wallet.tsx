import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

const iconFor: Record<string, { icon: string; bg: string; color: string }> = {
  escrow: { icon: 'lock-simple', bg: 'bg-[#FBE2DC]', color: 'text-[#A8311F]' },
  release: { icon: 'arrow-down-left', bg: 'bg-success-bg', color: 'text-success-text' },
  order: { icon: 'shopping-cart', bg: 'bg-cream', color: 'text-ink' },
  topup: { icon: 'bank', bg: 'bg-success-bg', color: 'text-success-text' },
  fee: { icon: 'receipt', bg: 'bg-warning-bg', color: 'text-warning-text' },
}

export function Wallet() {
  const wallet = useAppStore((s) => s.wallet)
  const transactions = useAppStore((s) => s.transactions)
  const bookings = useAppStore((s) => s.bookings)
  const disputes = useAppStore((s) => s.disputes)
  const recent = transactions.slice(0, 3)
  const activeJobs = bookings.filter((b) => b.status === 'active').length
  const openDisputeCount = disputes.filter((d) => d.status === 'open').length
  const inTotal = transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
  const outTotal = transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0)

  return (
    <Screen bottomNav="customer">
      <div className="bg-ink px-[22px] pb-6">
        <StatusBar tone="light" />
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-display font-bold text-[22px] text-cream">Wallet</span>
          <Link to="/transactions" className="inline-flex items-center justify-center w-11 h-11 text-cream">
            <i className="ph ph-clock-counter-clockwise text-[22px]" />
          </Link>
        </div>
        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-3.5">
          Available balance
        </div>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="font-display font-bold text-[44px] tracking-[-0.03em] text-cream">{formatNaira(wallet.balance)}</span>
          <i className="ph ph-eye-slash text-[19px] text-muted-2" />
        </div>
        <Link to="/escrow" className="flex items-center gap-2.5 bg-ink-soft border border-ink-line rounded-xl p-3.5 mt-[18px]">
          <i className="ph-fill ph-lock-simple text-xl text-brand" />
          <div className="flex-1">
            <div className="text-[14.5px] font-semibold text-cream">{formatNaira(wallet.escrowHeld)} held in escrow</div>
            <div className="text-[12.5px] text-muted-2 mt-0.5">Across {activeJobs} active job{activeJobs === 1 ? '' : 's'}</div>
          </div>
          <i className="ph-bold ph-caret-right text-base text-muted-2" />
        </Link>
        <Link to="/disputes" className="flex items-center gap-2.5 bg-ink-soft border border-ink-line rounded-xl p-3.5 mt-2.5">
          <i className="ph-fill ph-scales text-xl text-warning" />
          <div className="flex-1">
            <div className="text-[14.5px] font-semibold text-cream">My disputes</div>
            {openDisputeCount > 0 && (
              <div className="text-[12.5px] text-muted-2 mt-0.5">{openDisputeCount} under review</div>
            )}
          </div>
          <i className="ph-bold ph-caret-right text-base text-muted-2" />
        </Link>
        <div className="flex gap-3 mt-3.5">
          <Link to="/wallet/add" className="flex-1 flex items-center justify-center gap-2 h-[50px] bg-brand rounded-xl text-[15.5px] font-semibold text-white">
            <i className="ph-bold ph-plus text-[17px]" />
            Add money
          </Link>
          <Link to="/wallet/add" className="flex-1 flex items-center justify-center gap-2 h-[50px] border-[1.5px] border-ink-line rounded-xl text-[15.5px] font-semibold text-cream">
            <i className="ph-bold ph-arrow-up-right text-[17px]" />
            Withdraw
          </Link>
        </div>
      </div>

      <div className="px-[22px] pt-5">
        <div className="flex gap-3">
          <span className="flex-1 bg-white border border-line rounded-2xl p-3.5">
            <i className="ph-fill ph-arrow-down-left text-xl text-success" />
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-2 mt-2.5">Total in</div>
            <div className="font-display font-bold text-lg text-ink mt-1">{formatNaira(inTotal)}</div>
          </span>
          <span className="flex-1 bg-white border border-line rounded-2xl p-3.5">
            <i className="ph-fill ph-arrow-up-right text-xl text-brand-deep" />
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-2 mt-2.5">Total out</div>
            <div className="font-display font-bold text-lg text-ink mt-1">{formatNaira(outTotal)}</div>
          </span>
        </div>

        <div className="flex items-center justify-between mt-[22px]">
          <div className="font-display font-bold text-[18px] text-ink">Recent</div>
          <Link to="/transactions" className="text-sm font-semibold text-brand-hover">See all</Link>
        </div>

        <div className="bg-white border border-line rounded-2xl overflow-hidden mt-3">
          {recent.length === 0 && (
            <div className="p-4 text-sm text-muted text-center">No transactions yet</div>
          )}
          {recent.map((t, i) => {
            const meta = iconFor[t.kind]
            return (
              <div key={t.id} className={`flex items-center gap-3.5 p-3.5 ${i < recent.length - 1 ? 'border-b border-line-soft' : ''}`}>
                <span className={`flex-none inline-flex items-center justify-center w-10 h-10 rounded-[10px] ${meta.bg} ${meta.color}`}>
                  <i className={`ph-fill ph-${meta.icon} text-lg`} />
                </span>
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-ink">{t.label}</div>
                  <div className="text-[12.5px] text-muted-2 mt-0.5">{t.time}</div>
                </div>
                <span className={`font-display font-bold text-[15px] ${t.amount > 0 ? 'text-success-text' : 'text-ink'}`}>
                  {formatNaira(t.amount)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </Screen>
  )
}

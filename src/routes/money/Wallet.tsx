import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { TransactionRow } from '../../components/ui/TransactionRow'
import { QueryState } from '../../components/system/QueryState'
import { Skeleton } from '../../components/system/States'
import { useDisputes, useMyBookings, useTransactions, useWalletSummary } from '../../lib/api'
import { formatNaira } from '../../lib/format'

export function Wallet() {
  const { data: wallet, isLoading } = useWalletSummary()
  const transactions = useTransactions()
  const { data: bookings } = useMyBookings()
  const { data: disputes } = useDisputes()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('findwork-hide-balance') === '1'
    } catch {
      return false
    }
  })

  const heldJobs = (bookings ?? []).filter((b) => (b.status === 'pending' || b.status === 'active') && b.escrow_held > 0).length
  const openDisputes = (disputes ?? []).filter((d) => d.status === 'open').length
  const ledger = transactions.data ?? []
  const inTotal = ledger.filter((t) => t.balance_delta > 0).reduce((s, t) => s + t.balance_delta, 0)
  const outTotal = ledger.filter((t) => t.balance_delta < 0).reduce((s, t) => s - t.balance_delta, 0)

  function toggleHidden() {
    const next = !hidden
    setHidden(next)
    try {
      localStorage.setItem('findwork-hide-balance', next ? '1' : '0')
    } catch {
      // Private browsing: the toggle still works for this visit.
    }
  }

  const money = (n: number) => (hidden ? '₦ ••••' : formatNaira(n))

  return (
    <Screen bottomNav="customer">
      <div className="bg-ink px-[22px] pb-6">
        <StatusBar tone="light" />
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-display font-bold text-[22px] text-cream">Wallet</span>
          <Link to="/transactions" aria-label="All transactions" className="inline-flex items-center justify-center w-11 h-11 text-cream">
            <i className="ph ph-clock-counter-clockwise text-[22px]" />
          </Link>
        </div>
        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-3.5">Available balance</div>
        <div className="flex items-baseline gap-2 mt-1.5">
          {isLoading ? (
            <Skeleton className="h-11 w-48 bg-ink-soft" />
          ) : (
            <span className="font-display font-bold text-[44px] tracking-[-0.03em] text-cream">{money(wallet?.balance ?? 0)}</span>
          )}
          <button onClick={toggleHidden} aria-label={hidden ? 'Show balance' : 'Hide balance'}>
            <i className={`ph ${hidden ? 'ph-eye' : 'ph-eye-slash'} text-[19px] text-muted-2`} />
          </button>
        </div>
        <Link to="/escrow" className="flex items-center gap-2.5 bg-ink-soft border border-ink-line rounded-xl p-3.5 mt-[18px]">
          <i className="ph-fill ph-lock-simple text-xl text-brand" />
          <div className="flex-1">
            <div className="text-[14.5px] font-semibold text-cream">{money(wallet?.escrow_held ?? 0)} held in escrow</div>
            <div className="text-[12.5px] text-muted-2 mt-0.5">
              Across {heldJobs} booking{heldJobs === 1 ? '' : 's'}
            </div>
          </div>
          <i className="ph-bold ph-caret-right text-base text-muted-2" />
        </Link>
        <Link to="/disputes" className="flex items-center gap-2.5 bg-ink-soft border border-ink-line rounded-xl p-3.5 mt-2.5">
          <i className="ph-fill ph-scales text-xl text-warning" />
          <div className="flex-1">
            <div className="text-[14.5px] font-semibold text-cream">My disputes</div>
            {openDisputes > 0 && <div className="text-[12.5px] text-muted-2 mt-0.5">{openDisputes} under review</div>}
          </div>
          <i className="ph-bold ph-caret-right text-base text-muted-2" />
        </Link>
        <div className="flex gap-3 mt-3.5">
          <Link to="/wallet/add" className="flex-1 flex items-center justify-center gap-2 h-[50px] bg-brand rounded-xl text-[15.5px] font-semibold text-white">
            <i className="ph-bold ph-plus text-[17px]" />
            Add money
          </Link>
          <Link to="/wallet/withdraw" className="flex-1 flex items-center justify-center gap-2 h-[50px] border-[1.5px] border-ink-line rounded-xl text-[15.5px] font-semibold text-cream">
            <i className="ph-bold ph-arrow-up-right text-[17px]" />
            Withdraw
          </Link>
        </div>
      </div>

      <div className="px-[22px] pt-5 pb-6">
        <div className="flex gap-3">
          <span className="flex-1 bg-white border border-line rounded-2xl p-3.5">
            <i className="ph-fill ph-arrow-down-left text-xl text-success" />
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-2 mt-2.5">Money in</div>
            <div className="font-display font-bold text-lg text-ink mt-1">{money(inTotal)}</div>
          </span>
          <span className="flex-1 bg-white border border-line rounded-2xl p-3.5">
            <i className="ph-fill ph-arrow-up-right text-xl text-brand-deep" />
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-2 mt-2.5">Money out</div>
            <div className="font-display font-bold text-lg text-ink mt-1">{money(outTotal)}</div>
          </span>
        </div>

        <div className="flex items-center justify-between mt-[22px]">
          <div className="font-display font-bold text-[18px] text-ink">Recent</div>
          <Link to="/transactions" className="text-sm font-semibold text-brand-hover">
            See all
          </Link>
        </div>

        <div className="mt-3">
          <QueryState
            query={{ ...transactions, data: transactions.data?.slice(0, 4) }}
            errorMessage="We could not load your transactions."
            empty={{ icon: 'ph-receipt', title: 'No transactions yet', body: 'Add money to book, shop and learn.' }}
          >
            {(recent) => (
              <div className="bg-white border border-line rounded-2xl overflow-hidden">
                {recent.map((t, i) => (
                  <TransactionRow key={t.id} t={t} isLast={i === recent.length - 1} />
                ))}
              </div>
            )}
          </QueryState>
        </div>
      </div>
    </Screen>
  )
}

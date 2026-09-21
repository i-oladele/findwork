import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TransactionRow } from '../../components/ui/TransactionRow'
import { RequireProvider } from '../../components/system/RequireProvider'
import { useIncomingBookings, useTransactions, useWalletSummary } from '../../lib/api'
import { formatNaira, lagosDate } from '../../lib/format'
import type { WalletTransaction } from '../../lib/database.types'

const PERIODS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '12 months', days: 365 },
] as const

/** Payouts in (job price) and fees out, per booking release. */
function isEarning(t: WalletTransaction) {
  return (t.kind === 'release' && t.balance_delta > 0) || t.kind === 'fee'
}

export function Earnings() {
  return <RequireProvider>{() => <EarningsView />}</RequireProvider>
}

function EarningsView() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[0])
  const { data: wallet } = useWalletSummary()
  const { data: ledger } = useTransactions(500)
  const { data: bookings } = useIncomingBookings()

  const since = Date.now() - period.days * 86_400_000
  const earnings = (ledger ?? []).filter(isEarning)
  const inPeriod = earnings.filter((t) => new Date(t.created_at).getTime() >= since)
  const net = inPeriod.reduce((s, t) => s + t.balance_delta, 0)
  const fees = -inPeriod.filter((t) => t.kind === 'fee').reduce((s, t) => s + t.balance_delta, 0)
  const upcoming = (bookings ?? []).filter((b) => b.status === 'active' || b.status === 'pending')
  const upcomingValue = upcoming.reduce((s, b) => s + b.price, 0)

  // Last 7 Lagos days, oldest first, for the bar chart.
  const days = Array.from({ length: 7 }, (_, i) => lagosDate(new Date(Date.now() - (6 - i) * 86_400_000)))
  const perDay = days.map((d) =>
    earnings
      .filter((t) => {
        const ld = lagosDate(new Date(t.created_at))
        return ld.year === d.year && ld.month === d.month && ld.day === d.day
      })
      .reduce((s, t) => s + t.balance_delta, 0),
  )
  const peak = Math.max(1, ...perDay)

  return (
    <Screen bottomNav="provider">
      <div className="bg-ink px-[22px] pb-6">
        <StatusBar tone="light" />
        <div className="font-display font-bold text-[22px] text-cream mt-1.5">Earnings</div>
        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-4">Ready to withdraw</div>
        <div className="font-display font-bold text-[44px] tracking-[-0.03em] text-cream mt-1.5">{formatNaira(wallet?.balance ?? 0)}</div>
        {upcoming.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <i className="ph-fill ph-lock-simple text-sm text-brand" />
            <span className="text-[13.5px] text-muted-3">
              {formatNaira(upcomingValue)} held in escrow for you on {upcoming.length} booking{upcoming.length === 1 ? '' : 's'}
            </span>
          </div>
        )}
        <Link
          to="/wallet/withdraw"
          className="flex items-center justify-center gap-2 h-[52px] w-full mt-4 bg-brand rounded-xl text-base font-semibold text-white"
        >
          <i className="ph-bold ph-arrow-up-right text-lg" />
          Withdraw to bank
        </Link>
      </div>

      <div className="px-[22px] pt-[18px] pb-6">
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-[15px] py-2 text-[13.5px] ${
                period.label === p.label ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="bg-white border border-line rounded-2xl p-[18px] mt-3.5">
          <div className="flex items-baseline justify-between">
            <span className="font-display font-bold text-2xl text-ink">{formatNaira(net)}</span>
            <span className="text-[13px] text-muted-2">after {formatNaira(fees)} in fees</span>
          </div>
          <div className="text-[12px] text-muted-2 mt-4 mb-2">Last 7 days</div>
          <div className="flex items-end gap-2.5 h-[96px]" aria-hidden>
            {perDay.map((v, i) => (
              <span
                key={i}
                className={`flex-1 rounded-[3px] ${i === 6 ? 'bg-brand' : 'bg-line-soft'}`}
                style={{ height: `${Math.max(4, (Math.max(0, v) / peak) * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex gap-2.5 mt-2 font-mono text-[10px] text-muted text-center">
            {days.map((d, i) => (
              <span key={i} className="flex-1">
                {'SMTWTFS'[d.weekday]}
              </span>
            ))}
          </div>
        </div>

        <SectionLabel className="mt-5 mb-2.5">Payouts and fees</SectionLabel>
        {inPeriod.length === 0 ? (
          <div className="bg-white border border-line rounded-2xl p-6 text-center text-sm text-muted">
            Nothing in this period. Money lands here when a customer confirms a job is done.
          </div>
        ) : (
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            {inPeriod.map((t, i) => (
              <TransactionRow key={t.id} t={t} isLast={i === inPeriod.length - 1} />
            ))}
          </div>
        )}
      </div>
    </Screen>
  )
}

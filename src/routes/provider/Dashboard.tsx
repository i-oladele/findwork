import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Badge } from '../../components/ui/Badge'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { RequireProvider } from '../../components/system/RequireProvider'
import {
  useIncomingBookings,
  useOpenJobs,
  useProviderPackages,
  useTransactions,
  useUnreadCount,
  useWalletSummary,
} from '../../lib/api'
import { formatDateTime, formatNaira } from '../../lib/format'
import type { ProviderProfile } from '../../lib/database.types'
import { RequestCard } from './Requests'

export function ProviderDashboard() {
  return <RequireProvider>{(p) => <Dashboard provider={p} />}</RequireProvider>
}

function Dashboard({ provider }: { provider: ProviderProfile }) {
  const { data: bookings } = useIncomingBookings()
  const { data: wallet } = useWalletSummary()
  const { data: ledger } = useTransactions()
  const { data: packages } = useProviderPackages(provider.id)
  const { data: jobs } = useOpenJobs()
  const unread = useUnreadCount()

  const pending = (bookings ?? []).filter((b) => b.status === 'pending')
  const upcoming = (bookings ?? []).filter((b) => b.status === 'active')
  const weekAgo = Date.now() - 7 * 86_400_000
  const earnedThisWeek = (ledger ?? [])
    .filter((t) => (t.kind === 'release' || t.kind === 'fee') && new Date(t.created_at).getTime() >= weekAgo)
    .reduce((s, t) => s + t.balance_delta, 0)
  const liveCount = (packages ?? []).filter((p) => p.status === 'live').length

  return (
    <Screen bottomNav="provider">
      <div className="bg-ink px-[22px] pb-[22px]">
        <StatusBar tone="light" />
        <div className="flex items-center justify-between mt-1.5">
          <div className="min-w-0">
            <div className="text-[13.5px] text-muted-3">Selling as</div>
            <Link to="/work-profile" className="font-display font-bold text-[19px] text-cream mt-0.5 block truncate">
              {provider.business_name}
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              to="/provider/availability"
              className="inline-flex items-center gap-1.5 bg-ink-soft border border-ink-line rounded-full px-3 py-2 text-[12.5px] font-semibold text-cream"
            >
              <span className={`w-2 h-2 rounded-full ${provider.taking_bookings ? 'bg-success' : 'bg-muted-2'}`} />
              {provider.taking_bookings ? 'Open' : 'Closed'}
            </Link>
            <Link to="/notifications" aria-label="Notifications" className="relative inline-flex items-center justify-center w-11 h-11 text-cream">
              <i className="ph ph-bell text-[22px]" />
              {unread > 0 && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand" />}
            </Link>
          </div>
        </div>
        <Link to="/home" className="flex items-center justify-between bg-ink-soft border border-ink-line rounded-lg px-3.5 py-[11px] mt-4">
          <span className="flex items-center gap-2.5 text-[14.5px] font-semibold text-cream">
            <i className="ph-fill ph-arrows-left-right text-[17px] text-brand" />
            Switch to buying
          </span>
          <i className="ph-bold ph-arrow-right text-base text-muted-2" />
        </Link>
      </div>

      <div className="px-[22px] pt-[18px] pb-6">
        <div className="flex gap-3">
          <Link to="/provider/earnings" className="flex-1 bg-white border border-line rounded-2xl p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-2">Last 7 days</div>
            <div className="font-display font-bold text-[22px] text-ink mt-1.5">{formatNaira(earnedThisWeek)}</div>
            <div className="text-xs text-muted-2 mt-1.5">After fees</div>
          </Link>
          <Link to="/provider/requests" className="flex-1 bg-white border border-line rounded-2xl p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-2">To answer</div>
            <div className="font-display font-bold text-[22px] text-ink mt-1.5">{pending.length}</div>
            <div className={`text-xs mt-1.5 ${pending.length ? 'text-warning-text' : 'text-muted-2'}`}>
              {pending.length ? 'Booking requests' : 'All clear'}
            </div>
          </Link>
        </div>

        {!provider.verified && (
          <Link to="/get-verified" className="flex items-center gap-3 bg-warning-bg rounded-2xl p-4 mt-4">
            <i className="ph-fill ph-seal-check text-[22px] text-warning-text" />
            <span className="flex-1 text-[14px] leading-[1.45] text-warning-text">
              Get verified — customers look for the badge.
            </span>
            <i className="ph-bold ph-caret-right text-warning-text" />
          </Link>
        )}
        {liveCount === 0 && packages && (
          <Link to="/provider/services/new" className="flex items-center gap-3 bg-white border-[1.5px] border-brand rounded-2xl p-4 mt-4">
            <i className="ph-fill ph-plus-circle text-[22px] text-brand" />
            <span className="flex-1 text-[14px] leading-[1.45] text-ink">
              Add your first service so customers can book a fixed price.
            </span>
          </Link>
        )}

        <SectionLabel className="mt-[22px] mb-2.5">Needs you now</SectionLabel>
        {pending[0] ? (
          <RequestCard booking={pending[0]} highlighted />
        ) : (
          <div className="bg-white border border-line rounded-2xl p-6 text-center text-sm text-muted">Nothing needs you right now.</div>
        )}

        {upcoming.length > 0 && (
          <>
            <SectionLabel className="mt-[22px] mb-2.5">Coming up</SectionLabel>
            <div className="bg-white border border-line rounded-2xl overflow-hidden">
              {upcoming.slice(0, 3).map((b, i, arr) => (
                <Link
                  key={b.id}
                  to={`/chat/with/${b.customer_id}`}
                  className={`flex items-center justify-between gap-3 p-3.5 ${i < arr.length - 1 ? 'border-b border-line-soft' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-ink truncate">{b.service}</div>
                    <div className="text-[12.5px] text-muted-2 mt-0.5">
                      {b.customer?.full_name ?? 'Customer'} · {formatDateTime(b.start_at)}
                    </div>
                  </div>
                  <Badge tone="success" icon="lock-simple">
                    {formatNaira(b.price)}
                  </Badge>
                </Link>
              ))}
            </div>
          </>
        )}

        <SectionLabel className="mt-[22px] mb-2.5">Shortcuts</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Shortcut to="/provider/jobs" icon="magnifying-glass" color="text-brand" label="Find jobs" detail={jobs ? `${jobs.length} open` : ' '} />
          <Shortcut to="/provider/services" icon="list-checks" color="text-brand" label="My services" detail={`${liveCount} live`} />
          <Shortcut to="/provider/availability" icon="calendar-dots" color="text-success" label="Availability" detail={provider.taking_bookings ? 'Taking bookings' : 'Paused'} />
          <Shortcut to="/provider/earnings" icon="wallet" color="text-success" label="Payouts" detail={`${formatNaira(wallet?.balance ?? 0)} available`} />
          <Shortcut to="/courses" icon="graduation-cap" color="text-success" label="Learn & certify" detail="Build your skills" />
          <Shortcut to="/plans" icon="crown" color="text-brand" label={provider.plan === 'free' ? 'Upgrade plan' : 'Your plan'} detail="Lower fees" />
        </div>
      </div>
    </Screen>
  )
}

function Shortcut({ to, icon, color, label, detail }: { to: string; icon: string; color: string; label: string; detail: string }) {
  return (
    <Link to={to} className="bg-white border border-line rounded-2xl p-4">
      <i className={`ph-fill ph-${icon} text-[22px] ${color}`} />
      <div className="text-[15px] font-semibold text-ink mt-2.5">{label}</div>
      <div className="text-xs text-muted-2 mt-0.5">{detail}</div>
    </Link>
  )
}

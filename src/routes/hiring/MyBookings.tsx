import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Card } from '../../components/ui/Card'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { Badge } from '../../components/ui/Badge'
import { Alert } from '../../components/ui/Alert'
import { QueryState } from '../../components/system/QueryState'
import {
  useCancelBooking,
  useCompleteBooking,
  useDisputes,
  useMyBookings,
  useMyReviewedBookingIds,
  type BookingWithCustomer,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira } from '../../lib/format'

const tabs = ['Upcoming', 'Past', 'Cancelled'] as const
type Tab = (typeof tabs)[number]

function inTab(b: BookingWithCustomer, tab: Tab) {
  if (tab === 'Upcoming') return b.status === 'pending' || b.status === 'active'
  if (tab === 'Past') return b.status === 'done'
  return b.status === 'cancelled'
}

export function MyBookings() {
  const [tab, setTab] = useState<Tab>('Upcoming')
  const bookings = useMyBookings()
  const { data: disputes } = useDisputes()
  const { data: reviewed } = useMyReviewedBookingIds()

  const disputed = new Set(
    (disputes ?? []).filter((d) => d.ref_type === 'booking' && d.status === 'open').map((d) => d.ref_id),
  )

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-2.5 pb-6">
        <h2 className="font-display font-bold text-[30px] tracking-[-0.03em] text-ink">Bookings</h2>
        <div className="flex gap-1.5 bg-line-soft rounded-lg p-1 mt-4">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 h-10 rounded-md text-[14.5px] ${
                tab === t ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <QueryState
          query={{ ...bookings, data: bookings.data?.filter((b) => inTab(b, tab)) }}
          errorMessage="We could not load your bookings."
          empty={{
            icon: 'ph-calendar-blank',
            title: `No ${tab.toLowerCase()} bookings`,
            body: tab === 'Upcoming' ? 'Find a pro and book them — your money is held safely until the job is done.' : undefined,
            action: tab === 'Upcoming' ? <Link to="/search" className="text-[15px] font-semibold text-brand-hover">Find a pro</Link> : undefined,
          }}
        >
          {(list) =>
            (tab === 'Past' ? [...list].reverse() : list).map((b) => (
              <BookingCard key={b.id} booking={b} disputed={disputed.has(b.id)} reviewed={reviewed?.has(b.id) ?? false} />
            ))
          }
        </QueryState>
      </div>
    </Screen>
  )
}

function BookingCard({ booking, disputed, reviewed }: { booking: BookingWithCustomer; disputed: boolean; reviewed: boolean }) {
  const complete = useCompleteBooking()
  const cancel = useCancelBooking()
  const [error, setError] = useState<string | null>(null)
  const started = new Date(booking.start_at).getTime() <= Date.now()
  const total = booking.price + booking.fee

  async function run(action: () => Promise<unknown>, confirmText: string) {
    if (!window.confirm(confirmText)) return
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Card active={booking.status === 'active'} className="p-4 mt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2">{formatDateTime(booking.start_at)}</span>
        <StatusBadge booking={booking} disputed={disputed} />
      </div>
      <div className="flex gap-3.5 mt-3">
        <PlaceholderImage src={booking.provider?.photo_urls?.[0]} className="w-[52px] h-[52px] flex-none" />
        <div className="flex-1 min-w-0">
          <Link to={`/provider/${booking.provider_id}`} className="font-display font-semibold text-[16px] text-ink">
            {booking.provider_name}
          </Link>
          <div className="text-[13.5px] text-muted mt-0.5">
            {booking.service} · {formatNaira(total)}
            {booking.status === 'pending' || booking.status === 'active' ? ' held' : ''}
          </div>
        </div>
      </div>

      {error && <Alert className="mt-3">{error}</Alert>}

      <Link to={`/bookings/${booking.id}/reschedule`} className="inline-block mt-3 text-[14px] font-semibold text-brand-hover">
        {!started && !disputed && (booking.status === 'pending' || booking.status === 'active') ? 'Reschedule / time changes' : 'Time change history'}
      </Link>

      <div className="flex flex-wrap gap-2.5 mt-3.5">
        {booking.status === 'active' && !disputed && (
          <button
            onClick={() =>
              run(
                () => complete.mutateAsync(booking.id),
                `Release ${formatNaira(booking.escrow_held)} to ${booking.provider_name}? Only do this once the job is done.`,
              )
            }
            disabled={complete.isPending}
            className="flex-1 flex items-center justify-center h-11 bg-success text-white rounded-lg text-[14.5px] font-semibold disabled:opacity-50"
          >
            Job done — release payment
          </button>
        )}
        {booking.status === 'pending' && (
          <span className="flex-1 flex items-center justify-center h-11 border border-line rounded-lg text-[14px] font-semibold text-muted">
            Waiting for {booking.provider_name} to accept
          </span>
        )}
        {booking.status === 'done' && !reviewed && (
          <Link
            to={`/bookings/${booking.id}/review`}
            className="flex-1 flex items-center justify-center h-11 bg-ink text-cream rounded-lg text-[14.5px] font-semibold"
          >
            Leave a review
          </Link>
        )}
        <Link
          to={`/chat/with/${booking.provider_id}`}
          aria-label="Message"
          className="flex-none flex items-center justify-center w-11 h-11 border border-line rounded-lg text-ink"
        >
          <i className="ph ph-chat-circle-dots text-[19px]" />
        </Link>
      </div>

      {(booking.status === 'pending' || booking.status === 'active') && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-line-soft">
          {!started && !disputed ? (
            <button
              onClick={() =>
                run(
                  () => cancel.mutateAsync(booking.id),
                  `Cancel this booking? ${formatNaira(booking.escrow_held)} goes back to your wallet.`,
                )
              }
              disabled={cancel.isPending}
              className="text-[14px] font-semibold text-muted"
            >
              Cancel booking
            </button>
          ) : (
            <span />
          )}
          {disputed ? (
            <Link to="/disputes" className="text-[14px] font-semibold text-brand-hover">
              View dispute
            </Link>
          ) : (
            <Link to={`/disputes/new/booking/${booking.id}`} className="text-[14px] font-semibold text-brand-hover">
              Report a problem
            </Link>
          )}
        </div>
      )}
    </Card>
  )
}

function StatusBadge({ booking, disputed }: { booking: BookingWithCustomer; disputed: boolean }) {
  if (disputed) return <Badge tone="danger" icon="scales">On hold</Badge>
  switch (booking.status) {
    case 'done':
      return <Badge tone="success" icon="check-circle">Done</Badge>
    case 'active':
      return <Badge tone="danger" icon="lock-simple">In escrow</Badge>
    case 'pending':
      return <Badge tone="warning" icon="clock">Pending</Badge>
    default:
      return <Badge tone="neutral">Cancelled</Badge>
  }
}

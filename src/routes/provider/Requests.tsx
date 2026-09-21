import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Badge } from '../../components/ui/Badge'
import { Alert } from '../../components/ui/Alert'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { QueryState } from '../../components/system/QueryState'
import { RequireProvider } from '../../components/system/RequireProvider'
import {
  useCancelBooking,
  useIncomingBookings,
  useRespondToBooking,
  type BookingWithCustomer,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira } from '../../lib/format'
import type { BookingStatus } from '../../lib/database.types'

const TABS: { label: string; status: BookingStatus }[] = [
  { label: 'New', status: 'pending' },
  { label: 'Accepted', status: 'active' },
  { label: 'Done', status: 'done' },
  { label: 'Cancelled', status: 'cancelled' },
]

export function Requests() {
  return <RequireProvider>{() => <RequestList />}</RequireProvider>
}

function RequestList() {
  const [tab, setTab] = useState<BookingStatus>('pending')
  const bookings = useIncomingBookings()
  const newCount = bookings.data?.filter((b) => b.status === 'pending').length ?? 0
  const list = bookings.data?.filter((b) => b.status === tab)

  return (
    <Screen bottomNav="provider">
      <StatusBar />
      <div className="px-[22px] pt-2.5 pb-6">
        <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">Bookings</h2>
        <div className="flex gap-1 bg-line-soft rounded-lg p-1 mt-3.5">
          {TABS.map((t) => (
            <button
              key={t.status}
              onClick={() => setTab(t.status)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-md text-[13.5px] ${
                tab === t.status ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'
              }`}
            >
              {t.label}
              {t.status === 'pending' && newCount > 0 && (
                <span className="min-w-[19px] h-[19px] rounded-full bg-brand text-white font-mono text-[10.5px] flex items-center justify-center">
                  {newCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <QueryState
          query={{ ...bookings, data: tab === 'done' || tab === 'cancelled' ? list?.slice().reverse() : list }}
          errorMessage="We could not load your bookings."
          empty={{
            icon: 'ph-calendar-blank',
            title: tab === 'pending' ? 'No new requests' : 'Nothing here',
            body: tab === 'pending' ? 'When a customer books you, it shows up here for you to accept.' : undefined,
          }}
        >
          {(items) => (
            <div className="mt-4 space-y-3">
              {items.map((b, i) => (
                <RequestCard key={b.id} booking={b} highlighted={tab === 'pending' && i === 0} />
              ))}
            </div>
          )}
        </QueryState>
      </div>
    </Screen>
  )
}

/** One booking from the provider's side, with whatever they can do next. */
export function RequestCard({ booking: b, highlighted }: { booking: BookingWithCustomer; highlighted?: boolean }) {
  const respond = useRespondToBooking()
  const cancel = useCancelBooking()
  const [error, setError] = useState<string | null>(null)
  const started = new Date(b.start_at).getTime() <= Date.now()

  async function run(action: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <div className={`bg-white rounded-2xl p-4 ${highlighted ? 'border-[1.5px] border-brand' : 'border border-line'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2">{formatDateTime(b.start_at)}</span>
        <span className="font-display font-bold text-[17px] text-ink">{formatNaira(b.price)}</span>
      </div>
      <div className="flex gap-3 mt-3.5">
        <PlaceholderImage shape="circle" src={b.customer?.avatar_url ?? undefined} className="w-12 h-12 flex-none" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-base text-ink truncate">{b.customer?.full_name || 'Customer'}</div>
          <div className="text-[13px] text-muted-2 mt-0.5">{b.service}</div>
        </div>
      </div>

      {b.status === 'pending' && (
        <div className="flex items-center gap-2.5 bg-cream rounded-xl p-3 mt-3.5">
          <i className="ph-fill ph-lock-simple text-lg text-success" />
          <span className="text-[14px] text-ink">{formatNaira(b.escrow_held)} already paid into escrow</span>
        </div>
      )}
      {b.status === 'done' && (
        <div className="text-[13px] text-muted-2 mt-3">
          Paid {formatNaira(b.price - b.commission)} after {formatNaira(b.commission)} FindWork fee
        </div>
      )}
      {error && <Alert className="mt-3">{error}</Alert>}

      <Link to={`/bookings/${b.id}/reschedule`} className="inline-block mt-3 text-[14px] font-semibold text-brand-hover">
        {!started && (b.status === 'pending' || b.status === 'active') ? 'Reschedule / time changes' : 'Time change history'}
      </Link>

      <div className="flex gap-2.5 mt-3.5">
        {b.status === 'pending' ? (
          <button
            onClick={() => run(() => respond.mutateAsync({ bookingId: b.id, accept: true }))}
            disabled={respond.isPending}
            className="flex-1 flex items-center justify-center h-12 bg-success text-white rounded-lg text-[15px] font-semibold disabled:opacity-50"
          >
            Accept booking
          </button>
        ) : (
          <span className="flex-1 flex items-center">
            {b.status === 'active' && <Badge tone="success" icon="check-circle">Accepted — customer releases payment when done</Badge>}
            {b.status === 'done' && <Badge tone="success" icon="check-circle">Paid</Badge>}
            {b.status === 'cancelled' && <Badge tone="neutral">Cancelled · customer refunded</Badge>}
          </span>
        )}
        <Link
          to={`/chat/with/${b.customer_id}`}
          aria-label="Message customer"
          className="flex-none flex items-center justify-center w-12 h-12 border border-line rounded-lg text-ink"
        >
          <i className="ph ph-chat-circle-dots text-lg" />
        </Link>
      </div>

      {b.status === 'pending' && (
        <button
          onClick={() =>
            run(
              () => respond.mutateAsync({ bookingId: b.id, accept: false }),
              `Decline this booking? ${b.customer?.full_name || 'The customer'} gets a full refund.`,
            )
          }
          disabled={respond.isPending}
          className="flex items-center justify-center w-full h-11 mt-1.5 text-[15px] font-semibold text-muted"
        >
          Decline
        </button>
      )}
      {b.status === 'active' && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-line-soft">
          {!started ? (
            <button
              onClick={() =>
                run(() => cancel.mutateAsync(b.id), 'Cancel this booking? The customer is refunded in full.')
              }
              className="text-[14px] font-semibold text-muted"
            >
              Cancel booking
            </button>
          ) : (
            <span />
          )}
          <Link to={`/disputes/new/booking/${b.id}`} className="text-[14px] font-semibold text-brand-hover">
            Report a problem
          </Link>
        </div>
      )}
    </div>
  )
}

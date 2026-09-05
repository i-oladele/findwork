import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Card } from '../../components/ui/Card'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { Badge } from '../../components/ui/Badge'
import { formatNaira } from '../../data/mock'
import { useAppStore, type Booking } from '../../store/appStore'

const tabs = ['Upcoming', 'Past', 'Cancelled'] as const

function BookingCard({ booking }: { booking: Booking }) {
  const completeBooking = useAppStore((s) => s.completeBooking)
  const inEscrow = booking.status === 'active' && booking.escrowHeld > 0

  return (
    <Card active={inEscrow} className="p-4 mt-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-2">{booking.date} · {booking.time}</span>
        {booking.status === 'done' ? (
          <Badge tone="success" icon="check-circle">Done</Badge>
        ) : inEscrow ? (
          <Badge tone="danger" icon="lock-simple">In escrow</Badge>
        ) : (
          <Badge tone="warning" icon="clock">Pending</Badge>
        )}
      </div>
      <div className="flex gap-3.5 mt-3">
        <PlaceholderImage className="w-[52px] h-[52px] flex-none" />
        <div className="flex-1">
          <div className="font-display font-semibold text-[16px] text-ink">{booking.providerName}</div>
          <div className="text-[13.5px] text-muted mt-0.5">
            {booking.service} · {formatNaira(booking.price + booking.fee)}
            {inEscrow ? ' held' : ''}
          </div>
        </div>
      </div>
      {booking.status !== 'done' && (
        <div className="flex gap-2.5 mt-3.5">
          {inEscrow ? (
            <button
              onClick={() => completeBooking(booking.id)}
              className="flex-1 flex items-center justify-center h-11 bg-success text-white rounded-lg text-[14.5px] font-semibold"
            >
              Mark as done
            </button>
          ) : (
            <span className="flex-1 flex items-center justify-center h-11 border border-line rounded-lg text-[14.5px] font-semibold text-muted">
              Awaiting confirmation
            </span>
          )}
          <Link
            to={`/chat/${booking.providerId}`}
            className="flex-none flex items-center justify-center w-11 h-11 border border-line rounded-lg text-ink"
          >
            <i className="ph ph-chat-circle-dots text-[19px]" />
          </Link>
        </div>
      )}
    </Card>
  )
}

export function MyBookings() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Upcoming')
  const bookings = useAppStore((s) => s.bookings)

  const filtered = bookings.filter((b) => (tab === 'Past' ? b.status === 'done' : tab === 'Upcoming' ? b.status !== 'done' : false))

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-2.5">
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

        {filtered.length === 0 ? (
          <div className="bg-white border border-line rounded-2xl p-8 mt-4 text-center text-sm text-muted">
            No {tab.toLowerCase()} bookings.
          </div>
        ) : (
          filtered.map((booking) => <BookingCard key={booking.id} booking={booking} />)
        )}
      </div>
    </Screen>
  )
}

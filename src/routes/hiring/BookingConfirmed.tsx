import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function BookingConfirmed() {
  const lastBookingId = useAppStore((s) => s.lastBookingId)
  const bookings = useAppStore((s) => s.bookings)
  const booking = bookings.find((b) => b.id === lastBookingId) ?? bookings[0]

  if (!booking) {
    return (
      <Screen background="bg-ink">
        <StatusBar tone="light" />
        <div className="px-7 pt-[70px] text-cream">No booking found.</div>
      </Screen>
    )
  }

  const firstName = booking.providerName.split(' ')[0]

  return (
    <Screen background="bg-ink">
      <StatusBar tone="light" />
      <div className="px-7 pt-[70px]">
        <span className="inline-flex items-center justify-center w-[76px] h-[76px] rounded-full bg-success">
          <i className="ph-bold ph-check text-[38px] text-white" />
        </span>
        <h2 className="mt-8 font-display font-bold text-[38px] leading-[1.05] tracking-[-0.03em] text-cream">
          Booked. {firstName} has been told.
        </h2>
        <p className="mt-4 text-[16.5px] leading-[1.55] text-muted-3">
          {firstName} usually confirms within ten minutes. You will get a notification either way.
        </p>

        <div className="bg-ink-soft border border-ink-line rounded-2xl p-5 mt-8">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-3.5">
            Booking {booking.id}
          </div>
          <div className="flex justify-between text-[15px] text-muted-3">
            <span>When</span><span className="text-cream">{booking.date}, {booking.time}</span>
          </div>
          <div className="flex justify-between text-[15px] text-muted-3 mt-2.5">
            <span>In escrow</span><span className="font-display font-bold text-cream">{formatNaira(booking.escrowHeld)}</span>
          </div>
          <div className="flex justify-between items-center text-[15px] text-muted-3 mt-2.5">
            <span>Status</span>
            <Badge tone="warning" icon="clock">Awaiting confirmation</Badge>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 px-7 pt-3.5 pb-7 mt-8">
        <Button to={`/chat/${booking.providerId}`}>Message {firstName}</Button>
        <Button to="/bookings" variant="secondary" className="mt-3 text-cream">
          See my bookings
        </Button>
      </div>
    </Screen>
  )
}

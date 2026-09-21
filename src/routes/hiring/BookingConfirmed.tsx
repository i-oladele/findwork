import { useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { FullScreenLoader } from '../../components/system/States'
import { useBooking } from '../../lib/api'
import { formatDateTime, formatNaira, shortId } from '../../lib/format'

export function BookingConfirmed() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const { data: booking, isLoading } = useBooking(bookingId)

  if (isLoading) return <FullScreenLoader />

  if (!booking) {
    return (
      <Screen background="bg-ink">
        <StatusBar tone="light" />
        <div className="px-7 pt-[70px] text-cream">We could not find that booking.</div>
        <div className="px-7 mt-6">
          <Button to="/bookings">See my bookings</Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen background="bg-ink">
      <StatusBar tone="light" />
      <div className="px-7 pt-[60px]">
        <span className="inline-flex items-center justify-center w-[76px] h-[76px] rounded-full bg-success">
          <i className="ph-bold ph-check text-[38px] text-white" />
        </span>
        <h2 className="mt-8 font-display font-bold text-[36px] leading-[1.05] tracking-[-0.03em] text-cream">
          Booked. {booking.provider_name} has been told.
        </h2>
        <p className="mt-4 text-[16.5px] leading-[1.55] text-muted-3">
          You will get a notification when they accept. If they decline, your money comes straight back.
        </p>

        <div className="bg-ink-soft border border-ink-line rounded-2xl p-5 mt-8">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-3.5">
            Booking {shortId(booking.id)}
          </div>
          <div className="flex justify-between text-[15px] text-muted-3">
            <span>When</span>
            <span className="text-cream">{formatDateTime(booking.start_at)}</span>
          </div>
          <div className="flex justify-between text-[15px] text-muted-3 mt-2.5">
            <span>In escrow</span>
            <span className="font-display font-bold text-cream">{formatNaira(booking.escrow_held)}</span>
          </div>
          <div className="flex justify-between items-center text-[15px] text-muted-3 mt-2.5">
            <span>Status</span>
            {booking.status === 'active' ? (
              <Badge tone="success" icon="check-circle">
                Accepted
              </Badge>
            ) : (
              <Badge tone="warning" icon="clock">
                Awaiting confirmation
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="px-7 pt-3.5 pb-7 mt-8">
        <Button to={`/chat/with/${booking.provider_id}`} className="w-full">
          Message {booking.provider_name}
        </Button>
        <Button to="/bookings" variant="secondary" className="mt-3 w-full text-cream">
          See my bookings
        </Button>
      </div>
    </Screen>
  )
}

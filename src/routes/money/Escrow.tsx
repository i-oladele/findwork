import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Badge } from '../../components/ui/Badge'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function Escrow() {
  const navigate = useNavigate()
  const bookings = useAppStore((s) => s.bookings)
  const completeBooking = useAppStore((s) => s.completeBooking)
  const booking = bookings.find((b) => b.status === 'active' && b.escrowHeld > 0)

  function release() {
    if (!booking) return
    completeBooking(booking.id)
    navigate('/transactions')
  }

  if (!booking) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-[22px] pt-1.5">
          <div className="flex items-center gap-1.5">
            <Link to="/wallet" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
              <i className="ph-bold ph-arrow-left text-[22px]" />
            </Link>
            <span className="font-display font-semibold text-[17px] text-ink">Escrow</span>
          </div>
          <div className="bg-white border border-line rounded-2xl p-8 mt-6 text-center text-sm text-muted">
            Nothing held in escrow right now.
          </div>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/wallet" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Escrow · {booking.id}</span>
        </div>

        <div className="bg-ink rounded-2xl p-[22px] mt-4">
          <Badge tone="danger" icon="lock-simple">Held</Badge>
          <div className="font-display font-bold text-[40px] tracking-[-0.03em] text-cream mt-4">{formatNaira(booking.escrowHeld)}</div>
          <p className="mt-2 text-[14.5px] leading-[1.5] text-muted-3">
            Held since {booking.date}. {booking.providerName.split(' ')[0]} is paid the moment you confirm the job is done.
          </p>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">For</div>
        <div className="flex gap-3.5 bg-white border border-line rounded-2xl p-3.5">
          <PlaceholderImage className="w-[52px] h-[52px] flex-none" />
          <div className="flex-1">
            <div className="text-[15.5px] font-semibold text-ink">{booking.providerName}</div>
            <div className="text-[13px] text-muted-2 mt-1">{booking.service}</div>
          </div>
          <Link to={`/chat/${booking.providerId}`} className="inline-flex items-center justify-center w-11 h-11 border border-line rounded-lg text-ink">
            <i className="ph ph-chat-circle-dots text-lg" />
          </Link>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">How this works</div>
        <div className="bg-white border border-line rounded-2xl p-[18px]">
          <div className="flex gap-3">
            <i className="ph-fill ph-check-circle text-xl text-success" />
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-ink">You paid into escrow</div>
              <div className="text-[13px] text-muted-2 mt-0.5">{booking.date}, {booking.time}</div>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <i className="ph-fill ph-circle text-xl text-brand" />
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-ink">{booking.providerName.split(' ')[0]} is doing the work</div>
              <div className="text-[13px] text-muted-2 mt-0.5">In progress</div>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <i className="ph ph-circle text-xl text-[#C9C2B6]" />
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-muted-4">You release the money</div>
              <div className="text-[13px] text-muted mt-0.5">Or open a dispute within 48 hours</div>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
        <button onClick={release} className="flex items-center justify-center w-full h-14 bg-success text-white rounded-xl font-semibold text-[17px]">
          Release {formatNaira(booking.escrowHeld)} to {booking.providerName.split(' ')[0]}
        </button>
        <Link to={`/disputes/new/${booking.id}`} className="flex items-center justify-center h-[52px] mt-2 text-[16px] font-semibold text-brand-hover">
          Something went wrong — open a dispute
        </Link>
      </div>
    </Screen>
  )
}

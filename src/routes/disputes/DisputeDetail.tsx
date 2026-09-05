import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { useAppStore } from '../../store/appStore'

const reasons = ['Item not as described', 'Work not completed', 'Never delivered', 'Something else']

export function DisputeDetail() {
  const { refId } = useParams<{ refId: string }>()
  const navigate = useNavigate()
  const orders = useAppStore((s) => s.orders)
  const bookings = useAppStore((s) => s.bookings)
  const disputes = useAppStore((s) => s.disputes)
  const openDispute = useAppStore((s) => s.openDispute)

  const order = orders.find((o) => o.id === refId)
  const booking = bookings.find((b) => b.id === refId)
  const existing = disputes.find((d) => d.refId === refId)

  const [reason, setReason] = useState(reasons[0])
  const [details, setDetails] = useState('')

  if (!order && !booking) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-[22px] pt-6 text-center text-sm text-muted">Nothing found for {refId}.</div>
      </Screen>
    )
  }

  const refType: 'order' | 'booking' = order ? 'order' : 'booking'
  const label = order ? `Order ${order.id}` : `Booking with ${booking?.providerName}`
  const amount = order ? order.total : (booking?.price ?? 0) + (booking?.fee ?? 0)

  function submit() {
    openDispute({ refId: refId!, refType, reason: `${reason}${details ? ` — ${details}` : ''}` })
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/disputes" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">{existing ? 'Dispute' : 'Open a dispute'}</span>
        </div>

        <div className="flex items-center gap-3.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
          <PlaceholderImage className="w-12 h-12 flex-none" />
          <div className="flex-1">
            <div className="text-[15.5px] font-semibold text-ink">{label}</div>
            <div className="text-[13px] text-muted-2 mt-0.5">₦{amount.toLocaleString()}</div>
          </div>
        </div>

        {existing ? (
          <>
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Status</div>
            <div className="bg-white border border-line rounded-2xl p-[18px]">
              <div className="flex items-center justify-between">
                {existing.status === 'open' ? (
                  <Badge tone="warning" icon="clock">Under review</Badge>
                ) : (
                  <Badge tone="success" icon="check-circle">Resolved</Badge>
                )}
                <span className="text-[12.5px] text-muted-2">Opened {existing.openedAt}</span>
              </div>
              <p className="mt-3 text-[14.5px] leading-[1.5] text-text-soft">{existing.reason}</p>
              <div className="flex items-start gap-2.5 mt-4 pt-4 border-t border-line-soft">
                <i className="ph-fill ph-info text-base text-muted-2 relative top-0.5" />
                <p className="text-[13px] leading-[1.45] text-muted">
                  A FindWork moderator is reviewing this. Any escrow tied to this order stays held until it's resolved.
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">What went wrong</div>
            <div className="flex flex-wrap gap-2">
              {reasons.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`rounded-full px-[15px] py-2 text-[13.5px] ${
                    reason === r ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Details</div>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
                placeholder="Tell us what happened"
                className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
              />
            </div>

            <div className="mt-4">
              <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Evidence</div>
              <div className="flex gap-2.5">
                <PlaceholderImage className="w-16 h-16" />
                <div className="w-16 h-16 border-[1.5px] border-dashed border-[#C9A99E] rounded-lg flex items-center justify-center text-muted-2">
                  <i className="ph ph-camera text-xl" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {!existing && (
        <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
          <Button
            onClick={() => {
              submit()
              navigate('/disputes')
            }}
          >
            Submit dispute
          </Button>
        </div>
      )}
    </Screen>
  )
}

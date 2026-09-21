import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { QueryState } from '../../components/system/QueryState'
import { useDisputes, useMyBookings } from '../../lib/api'
import { formatDateTime, formatNaira } from '../../lib/format'

/** Every booking with the customer's money on hold, and what happens next for each. */
export function Escrow() {
  const bookings = useMyBookings()
  const { data: disputes } = useDisputes()
  const held = bookings.data?.filter((b) => (b.status === 'pending' || b.status === 'active') && b.escrow_held > 0)
  const disputed = new Set((disputes ?? []).filter((d) => d.status === 'open' && d.ref_type === 'booking').map((d) => d.ref_id))
  const total = (held ?? []).reduce((s, b) => s + b.escrow_held, 0)

  return (
    <Screen>
      <PageHeader title="Escrow" back="/wallet" />
      <div className="px-[22px] pb-8">
        <div className="bg-ink rounded-2xl p-[22px] mt-4">
          <Badge tone="danger" icon="lock-simple">
            Held
          </Badge>
          <div className="font-display font-bold text-[40px] tracking-[-0.03em] text-cream mt-4">{formatNaira(total)}</div>
          <p className="mt-2 text-[14.5px] leading-[1.5] text-muted-3">
            Money you paid for bookings sits here until you confirm the job is done. If a provider declines or you
            cancel before the start time, it comes back to your wallet.
          </p>
        </div>

        <QueryState
          query={{ ...bookings, data: held }}
          errorMessage="We could not load your bookings."
          empty={{ icon: 'ph-lock-simple-open', title: 'Nothing held right now' }}
        >
          {(list) =>
            list.map((b) => (
              <Card key={b.id} to="/bookings" className="p-4 mt-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold text-[16px] text-ink truncate">{b.provider_name}</span>
                  <span className="font-display font-bold text-[16px] text-ink">{formatNaira(b.escrow_held)}</span>
                </div>
                <div className="text-[13.5px] text-muted mt-1">
                  {b.service} · {formatDateTime(b.start_at)}
                </div>
                <div className="mt-2.5">
                  {disputed.has(b.id) ? (
                    <Badge tone="danger" icon="scales">On hold — dispute open</Badge>
                  ) : b.status === 'pending' ? (
                    <Badge tone="warning" icon="clock">Waiting for the provider to accept</Badge>
                  ) : (
                    <Badge tone="success" icon="check-circle">Accepted — release when the job is done</Badge>
                  )}
                </div>
              </Card>
            ))
          }
        </QueryState>

        <div className="flex items-start gap-2.5 bg-white border border-line rounded-2xl p-4 mt-5">
          <i className="ph-fill ph-info text-[18px] text-muted-2 relative top-0.5" />
          <p className="text-[13.5px] leading-[1.5] text-text-soft">
            Release and cancel from{' '}
            <Link to="/bookings" className="font-semibold text-brand-hover">
              Bookings
            </Link>
            . If something went wrong, report a problem there and our team will hold the money until it is settled.
          </p>
        </div>
      </div>
    </Screen>
  )
}

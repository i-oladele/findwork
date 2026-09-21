import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { QueryState } from '../../components/system/QueryState'
import { useAuth } from '../../lib/authContext'
import { useDisputes } from '../../lib/api'
import { agoPhrase, shortId } from '../../lib/format'

export function Disputes() {
  const { user } = useAuth()
  const disputes = useDisputes()

  return (
    <Screen>
      <PageHeader title="Disputes" back="/wallet" />
      <div className="px-[22px] pb-6">
        <QueryState
          query={disputes}
          errorMessage="We could not load your disputes."
          empty={{
            icon: 'ph-scales',
            title: 'No disputes',
            body: 'If something goes wrong with a booking or an order, report it from that screen and the money stays on hold.',
          }}
        >
          {(list) =>
            list.map((d) => (
              <Card key={d.id} to={`/disputes/${d.id}`} className="p-4 mt-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2">
                    {d.ref_type === 'order' ? 'Order' : 'Booking'} {shortId(d.ref_id)}
                  </span>
                  {d.status === 'open' ? (
                    <Badge tone="warning" icon="clock">Under review</Badge>
                  ) : d.outcome === 'refund' ? (
                    <Badge tone="success" icon="arrow-counter-clockwise">Refunded</Badge>
                  ) : d.outcome === 'release' ? (
                    <Badge tone="success" icon="check-circle">Paid out</Badge>
                  ) : (
                    <Badge tone="neutral">Closed</Badge>
                  )}
                </div>
                <p className="mt-2.5 text-[14.5px] leading-[1.5] text-ink line-clamp-2">{d.reason}</p>
                <div className="text-[12.5px] text-muted-2 mt-1.5">
                  {d.raised_by === user?.id ? 'You reported this' : 'Reported against you'} {agoPhrase(d.opened_at)}
                </div>
              </Card>
            ))
          }
        </QueryState>

        <Link to="/help" className="block text-center mt-6 text-[15px] font-semibold text-brand-hover">
          Contact support
        </Link>
      </div>
    </Screen>
  )
}

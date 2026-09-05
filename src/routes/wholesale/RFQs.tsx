import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function RFQs() {
  const rfqs = useAppStore((s) => s.rfqs)

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Link to="/home" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
              <i className="ph-bold ph-arrow-left text-[22px]" />
            </Link>
            <span className="font-display font-semibold text-[17px] text-ink">My RFQs</span>
          </div>
          <Link to="/rfqs/new" className="inline-flex items-center justify-center w-11 h-11 bg-brand rounded-xl text-white">
            <i className="ph-bold ph-plus text-xl" />
          </Link>
        </div>
        <p className="mt-3 text-[15px] leading-[1.55] text-muted">
          Request quotations from verified suppliers for bulk or wholesale orders.
        </p>

        {rfqs.length === 0 ? (
          <div className="bg-white border border-line rounded-2xl p-8 mt-6 text-center">
            <p className="text-sm text-muted">No RFQs yet.</p>
            <Link to="/rfqs/new" className="inline-block mt-3 text-sm font-semibold text-brand-hover">
              Request a quotation
            </Link>
          </div>
        ) : (
          rfqs.map((r) => (
            <Card key={r.id} to={`/rfqs/${r.id}`} className="p-4 mt-4">
              <div className="flex items-start justify-between gap-3">
                <span className="font-display font-semibold text-[16.5px] leading-[1.25] text-ink">{r.title}</span>
                {r.status === 'quoted' ? (
                  <Badge tone="success" icon="chat-circle-dots">Quoted</Badge>
                ) : r.status === 'closed' ? (
                  <Badge tone="neutral">Closed</Badge>
                ) : (
                  <Badge tone="warning" icon="clock">Open</Badge>
                )}
              </div>
              <p className="mt-2 text-sm leading-[1.5] text-muted">{r.description}</p>
              <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-line-soft">
                <span className="text-[13.5px] text-muted-2">Qty {r.quantity} · by {r.deadline}</span>
                <span className="font-display font-bold text-[15px] text-ink">Up to {formatNaira(r.budgetMax)}</span>
              </div>
            </Card>
          ))
        )}
      </div>
    </Screen>
  )
}

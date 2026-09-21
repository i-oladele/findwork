import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { QueryState } from '../../components/system/QueryState'
import { useRfqs } from '../../lib/api'
import { agoPhrase, formatNaira } from '../../lib/format'

const TABS = [
  { id: 'mine', label: 'My requests' },
  { id: 'open', label: 'Quote on' },
] as const

/** Buyers post bulk requests; suppliers quote on other people's. */
export function RFQs() {
  const [scope, setScope] = useState<'mine' | 'open'>('mine')
  const rfqs = useRfqs(scope)

  return (
    <Screen>
      <PageHeader
        title="Bulk orders"
        back="/home"
        right={
          <Link to="/rfqs/new" aria-label="New request" className="inline-flex items-center justify-center w-11 h-11 bg-brand rounded-xl text-white">
            <i className="ph-bold ph-plus text-xl" />
          </Link>
        }
      />
      <div className="px-[22px] pb-6">
        <div className="flex gap-1.5 bg-line-soft rounded-lg p-1 mt-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setScope(t.id)}
              className={`flex-1 h-10 rounded-md text-[14.5px] ${scope === t.id ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <QueryState
          query={rfqs}
          errorMessage="We could not load requests."
          empty={{
            icon: 'ph-package',
            title: scope === 'mine' ? 'No requests yet' : 'Nothing to quote on',
            body:
              scope === 'mine'
                ? 'Ask suppliers for bulk pricing — describe what you need once and compare their quotes.'
                : 'Bulk requests from other buyers appear here.',
            action:
              scope === 'mine' ? (
                <Link to="/rfqs/new" className="text-[15px] font-semibold text-brand-hover">
                  Request a quotation
                </Link>
              ) : undefined,
          }}
        >
          {(list) =>
            list.map((r) => (
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
                <p className="mt-2 text-sm leading-[1.5] text-muted line-clamp-2">{r.description}</p>
                <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-line-soft">
                  <span className="text-[13.5px] text-muted-2">
                    {r.quantity ? `Qty ${r.quantity} · ` : ''}
                    {r.deadline ? `by ${r.deadline}` : agoPhrase(r.created_at)}
                  </span>
                  {r.budget_max ? (
                    <span className="font-display font-bold text-[15px] text-ink">Up to {formatNaira(r.budget_max)}</span>
                  ) : null}
                </div>
              </Card>
            ))
          }
        </QueryState>
      </div>
    </Screen>
  )
}

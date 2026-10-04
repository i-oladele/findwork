import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { useAdminAssignDelivery, useAdminDeliveries, useAdminReviewRider, useAdminRiders } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, shortId } from '../../lib/format'

const panel = 'bg-white border border-line rounded-2xl p-4 mb-3'
const STATUS = { awaiting_rider: 'Waiting for a rider', assigned: 'Rider collecting', picked_up: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled' } as const

/** Rider applications to approve, and deliveries in progress: assign a rider to one nobody has taken. */
export function LogisticsTab({ onError }: { onError: (message: string | null) => void }) {
  const riders = useAdminRiders()
  const deliveries = useAdminDeliveries()
  const review = useAdminReviewRider()
  const assign = useAdminAssignDelivery()
  const [note, setNote] = useState<Record<string, string>>({})
  const pending = riders.data?.filter((r) => r.status === 'pending') ?? []
  const online = riders.data?.filter((r) => r.status === 'approved' && r.online) ?? []
  const waiting = deliveries.data?.filter((d) => d.status === 'awaiting_rider') ?? []
  const moving = deliveries.data?.filter((d) => d.status !== 'awaiting_rider') ?? []

  return (
    <>
      <SectionLabel className="mb-2.5">Rider applications ({pending.length})</SectionLabel>
      {pending.length === 0 && <p className="text-[14px] text-muted pb-4">Nobody is waiting for approval.</p>}
      {pending.map((r) => (
        <div key={r.id} className={panel}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-semibold text-[15.5px] text-ink truncate">{r.profile?.full_name || 'Unnamed account'}</span>
            {r.profile?.verified_at ? <Badge tone="success" icon="seal-check">ID verified</Badge> : <Badge tone="warning">ID not verified</Badge>}
          </div>
          <div className="text-[13.5px] text-muted-2 mt-1">{r.vehicle}{r.plate ? ` · ${r.plate}` : ''} · applied {formatDateTime(r.created_at)}</div>
          <input value={note[r.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="Reason, if rejecting (they will see it)"
            aria-label={`Reason for ${r.profile?.full_name ?? 'this rider'}`} className="w-full h-11 mt-3 bg-cream rounded-lg px-3 text-[14px] text-ink outline-none placeholder:text-muted-2" />
          <div className="flex gap-2 mt-3">
            <button disabled={review.isPending} className="flex-1 h-11 bg-success text-white rounded-lg text-[14px] font-semibold disabled:opacity-50" onClick={() => {
              if (!r.profile?.verified_at && !window.confirm('This rider is not ID verified. Approve anyway?')) return
              onError(null)
              review.mutate({ riderId: r.id, approve: true, note: note[r.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
            }}>Approve</button>
            <button disabled={review.isPending || !(note[r.id] ?? '').trim()} className="flex-1 h-11 border border-line rounded-lg text-[14px] font-semibold text-muted disabled:opacity-50" onClick={() => {
              onError(null)
              review.mutate({ riderId: r.id, approve: false, note: note[r.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
            }}>Reject</button>
          </div>
        </div>
      ))}

      <SectionLabel className="mt-4 mb-2.5">Waiting for a rider ({waiting.length}) · {online.length} rider{online.length === 1 ? '' : 's'} online</SectionLabel>
      {waiting.length === 0 && <p className="text-[14px] text-muted pb-4">Every dispatched order has a rider.</p>}
      {waiting.map((d) => (
        <div key={d.id} className={panel}>
          <div className="font-display font-semibold text-[15px] text-ink">Order #{shortId(d.order_id)}</div>
          <div className="text-[13.5px] text-text-soft mt-1">From {d.pickup_address ?? 'FindWork fulfilment'}</div>
          <div className="text-[13.5px] text-text-soft whitespace-pre-line">To {d.dropoff_address}</div>
          <div className="text-[12px] text-muted-2 mt-1">Waiting since {formatDateTime(d.created_at)}</div>
          <select aria-label={`Assign order ${shortId(d.order_id)} to a rider`} defaultValue="" disabled={assign.isPending || online.length === 0}
            className="w-full h-11 mt-3 bg-cream rounded-lg px-3 text-[14px] text-ink"
            onChange={(e) => {
              const riderId = e.target.value
              if (!riderId) return
              onError(null)
              assign.mutate({ deliveryId: d.id, riderId }, { onError: (err) => onError(friendlyError(err)) })
              e.target.value = ''
            }}>
            <option value="">{online.length === 0 ? 'No riders online' : 'Assign to a rider…'}</option>
            {online.map((r) => <option key={r.id} value={r.id}>{r.profile?.full_name || 'Rider'} · {r.vehicle}</option>)}
          </select>
        </div>
      ))}

      <SectionLabel className="mt-4 mb-2.5">In progress ({moving.length})</SectionLabel>
      {moving.map((d) => (
        <div key={d.id} className={panel}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-semibold text-[15px] text-ink">Order #{shortId(d.order_id)}</span>
            <Badge tone={d.status === 'picked_up' ? 'success' : 'warning'}>{STATUS[d.status]}</Badge>
          </div>
          <div className="text-[13px] text-muted-2 mt-1">{d.eta_minutes ? `About ${d.eta_minutes} min to go` : 'No estimate'} · assigned {d.assigned_at ? formatDateTime(d.assigned_at) : ''}</div>
        </div>
      ))}
    </>
  )
}

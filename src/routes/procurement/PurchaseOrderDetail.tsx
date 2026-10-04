import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { EmptyState, ErrorState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import {
  PO_STATUS,
  useCancelPurchaseOrder,
  useConfirmPurchaseOrder,
  useHoldPurchaseOrder,
  useMarkPurchaseOrderDelivered,
  useMyOrganizations,
  useMyProducts,
  useReviewPurchaseOrder,
  useRfqItems,
  type PurchaseOrderWithParties,
} from '../../lib/api'
import { usePurchaseOrder } from '../../lib/api/procurement'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira } from '../../lib/format'
import type { Invoice } from '../../lib/database.types'

export function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const query = usePurchaseOrder(id)
  if (query.isLoading) return <FullScreenLoader />
  return (
    <Screen>
      <PageHeader title={query.data ? `PO-${query.data.order.number}` : 'Purchase order'} back="/procurement" />
      <div className="px-[22px] pb-10">
        {query.isError ? <ErrorState message="We could not load this purchase order." onRetry={() => void query.refetch()} />
          : !query.data ? <EmptyState icon="ph-file-text" title="Purchase order not found" />
            : <Detail po={query.data.order} invoice={query.data.invoice} />}
      </div>
    </Screen>
  )
}

function Detail({ po, invoice }: { po: PurchaseOrderWithParties; invoice: Invoice | null }) {
  const { user } = useAuth()
  const orgs = useMyOrganizations()
  const items = useRfqItems(po.rfq_id)
  const review = useReviewPurchaseOrder()
  const deliver = useMarkPurchaseOrderDelivered()
  const confirm = useConfirmPurchaseOrder()
  const cancel = useCancelPurchaseOrder()
  const hold = useHoldPurchaseOrder()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const role = orgs.data?.find((o) => o.id === po.organization_id)?.role
  const supplier = user?.id === po.supplier_id
  const buyingSide = user?.id === po.buyer_id || user?.id === po.payer_id || role === 'owner' || role === 'approver'
  const canApprove = po.status === 'pending_approval' && (role === 'owner' || role === 'approver')
  const pending = review.isPending || deliver.isPending || confirm.isPending || cancel.isPending || hold.isPending
  const run = (action: Promise<unknown>) => { setError(null); action.then(() => setNote('')).catch((err) => setError(friendlyError(err))) }

  return (
    <>
      <div className="bg-ink rounded-2xl p-[18px] mt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted-2">PO-{po.number}</span>
          <Badge tone={PO_STATUS[po.status].tone}>{PO_STATUS[po.status].label}</Badge>
        </div>
        <div className="font-display font-bold text-[28px] text-cream mt-1.5">{formatNaira(po.amount)}</div>
        <div className="text-[14.5px] text-muted-3 mt-0.5">{po.title}</div>
      </div>

      <dl className="bg-white border border-line rounded-2xl p-4 mt-4 space-y-2 text-[14px]">
        <Row label="Supplier" value={po.supplier?.full_name || 'Supplier'} />
        <Row label="Buyer" value={`${po.buyer?.full_name || 'Buyer'}${po.organization ? ` · ${po.organization.name}` : ''}`} />
        <Row label="Raised" value={formatDateTime(po.created_at)} />
        {po.funded_at && <Row label="Paid into escrow" value={formatDateTime(po.funded_at)} />}
        {po.delivered_at && <Row label="Marked delivered" value={formatDateTime(po.delivered_at)} />}
        {po.closed_at && <Row label="Closed" value={formatDateTime(po.closed_at)} />}
        {po.status === 'completed' && supplier && <Row label="FindWork fee" value={formatNaira(po.commission)} />}
      </dl>

      {(items.data?.length ?? 0) > 0 && (
        <>
          <SectionLabel className="mt-5 mb-2.5">What was ordered</SectionLabel>
          <ul className="bg-white border border-line rounded-2xl p-4 space-y-1.5 text-[14px] text-ink">
            {items.data!.map((it) => <li key={it.position} className="flex justify-between gap-3"><span>{it.description}</span><span className="text-muted">{it.quantity} {it.unit}</span></li>)}
          </ul>
        </>
      )}

      {po.decision_note && <Alert tone="info" className="mt-4">Note: {po.decision_note}</Alert>}
      {po.status === 'on_hold' && <Alert tone="info" className="mt-4">The buyer reported a problem: “{po.hold_reason}”. The payment stays in escrow until the FindWork team decides.</Alert>}
      {po.status === 'delivered' && buyingSide && <Alert tone="info" className="mt-4">Confirm receipt to pay the supplier. If you do nothing, the supplier is paid 14 days after delivery.</Alert>}
      {error && <Alert className="mt-4">{error}</Alert>}

      {invoice && <Link to={`/purchase-orders/${po.id}/invoice`} className="inline-flex items-center gap-2 min-h-11 mt-3 text-[14.5px] font-semibold text-brand-hover"><i className="ph ph-receipt" /> Invoice INV-{invoice.number} · {invoice.status}</Link>}

      {(canApprove || (buyingSide && po.status === 'delivered')) && (
        <label className="block mt-4 text-[14px] text-text-soft">{canApprove ? 'Note for the buyer (required to reject)' : 'If something is wrong, say what'}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className="block w-full mt-1.5 bg-white border-[1.5px] border-line rounded-lg p-3 text-ink outline-none" />
        </label>
      )}

      <div className="mt-4 space-y-2.5">
        {canApprove && (
          <>
            <Button loading={review.isPending} disabled={pending} onClick={() => { if (window.confirm(`Approve and pay ${formatNaira(po.amount)} into escrow?`)) run(review.mutateAsync({ id: po.id, approve: true, note })) }}>Approve and pay into escrow</Button>
            <Button variant="secondary" className="text-ink" disabled={pending || note.trim().length < 3} onClick={() => run(review.mutateAsync({ id: po.id, approve: false, note }))}>Reject</Button>
          </>
        )}
        {supplier && po.status === 'funded' && <DeliverForm onDeliver={(stock) => run(deliver.mutateAsync({ id: po.id, stock }))} pending={pending} />}
        {buyingSide && (po.status === 'funded' || po.status === 'delivered') && (
          <Button loading={confirm.isPending} disabled={pending} onClick={() => { if (window.confirm(`Release ${formatNaira(po.amount)} to ${po.supplier?.full_name ?? 'the supplier'}? Only do this once the goods have arrived.`)) run(confirm.mutateAsync(po.id)) }}>Goods received — pay the supplier</Button>
        )}
        {buyingSide && po.status === 'delivered' && (
          <Button variant="secondary" className="text-ink" disabled={pending || note.trim().length < 10} onClick={() => run(hold.mutateAsync({ id: po.id, reason: note }))}>Hold the payment and get help</Button>
        )}
        {(buyingSide || supplier) && (po.status === 'funded' || po.status === 'pending_approval') && (
          <button disabled={pending} className="w-full min-h-11 text-[14.5px] font-semibold text-muted" onClick={() => { if (window.confirm(po.status === 'funded' ? 'Cancel this purchase order? The money goes back to the buyer.' : 'Cancel this purchase order?')) run(cancel.mutateAsync(po.id)) }}>Cancel this purchase order</button>
        )}
      </div>
      <Link to={`/chat/with/${supplier ? po.buyer_id : po.supplier_id}`} className="inline-block min-h-11 pt-4 text-[14.5px] font-semibold text-brand-hover">Message the {supplier ? 'buyer' : 'supplier'}</Link>
    </>
  )
}

/** Marking delivery can also take the goods out of the supplier's own product stock. */
function DeliverForm({ onDeliver, pending }: { onDeliver: (stock: { product_id: string; qty: number }[]) => void; pending: boolean }) {
  const { data: products } = useMyProducts()
  const [lines, setLines] = useState<Record<string, string>>({})
  const tracked = (products ?? []).filter((p) => p.stock !== null)
  const stock = Object.entries(lines).map(([product_id, qty]) => ({ product_id, qty: Number(qty.replace(/\D/g, '')) })).filter((l) => l.qty > 0)
  return (
    <div className="bg-white border border-line rounded-2xl p-4">
      {tracked.length > 0 && (
        <details>
          <summary className="cursor-pointer min-h-11 flex items-center text-[14px] font-semibold text-ink">Take these goods out of my shop stock (optional)</summary>
          {tracked.map((p) => (
            <label key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-[14px] text-ink">
              <span className="truncate">{p.name} <span className="text-muted-2">· {p.stock} in stock</span></span>
              <input value={lines[p.id] ?? ''} inputMode="numeric" placeholder="0" aria-label={`Quantity of ${p.name}`} onChange={(e) => setLines((l) => ({ ...l, [p.id]: e.target.value }))} className="w-20 bg-cream rounded-lg h-10 px-3 outline-none" />
            </label>
          ))}
        </details>
      )}
      <Button className="mt-2" disabled={pending} onClick={() => { if (window.confirm('Mark this order as delivered? The buyer is asked to confirm, and you are paid when they do.')) onDeliver(stock) }}>Mark as delivered</Button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted-2">{label}</dt><dd className="text-ink text-right">{value}</dd></div>
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { QueryState } from '../../components/system/QueryState'
import { RequireProvider } from '../../components/system/RequireProvider'
import { OrderStatusBadge } from '../commerce/OrderReturn'
import { useCancelOrder, useDispatchOrder, useDisputes, useSellerOrders, type SellerOrder } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira, shortId } from '../../lib/format'

const TABS = [
  { key: 'send', label: 'To send', statuses: ['placed'] },
  { key: 'transit', label: 'On the way', statuses: ['dispatched'] },
  { key: 'done', label: 'Finished', statuses: ['delivered', 'returned', 'cancelled'] },
] as const

export function SellerOrders() {
  return <RequireProvider>{() => <OrderList />}</RequireProvider>
}

function OrderList() {
  const orders = useSellerOrders()
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('send')
  const [error, setError] = useState<string | null>(null)

  const current = TABS.find((t) => t.key === tab)!
  const shown = orders.data?.filter((o) => (current.statuses as readonly string[]).includes(o.status))

  return (
    <Screen bottomNav="provider">
      <PageHeader title="Orders" back="/provider" />
      <div className="px-[22px] pb-8">
        <div className="flex gap-2 mt-2">
          {TABS.map((t) => {
            const count = orders.data?.filter((o) => (t.statuses as readonly string[]).includes(o.status)).length ?? 0
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3.5 py-2 text-[13.5px] ${
                  tab === t.key ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
                }`}
              >
                {t.label}
                {t.key !== 'done' && count > 0 ? ` · ${count}` : ''}
              </button>
            )
          })}
        </div>
        {error && <Alert className="mt-4">{error}</Alert>}

        <QueryState
          query={{ ...orders, data: shown }}
          errorMessage="We could not load your orders."
          empty={{
            icon: 'ph-package',
            title: tab === 'send' ? 'Nothing to send' : tab === 'transit' ? 'Nothing on the way' : 'No finished orders yet',
            body: tab === 'send' ? 'New orders for your goods appear here, already paid into escrow.' : undefined,
            action:
              tab === 'send' ? (
                <Link to="/provider/products" className="text-[15px] font-semibold text-brand-hover">
                  My products
                </Link>
              ) : undefined,
          }}
        >
          {(list) => list.map((o) => <OrderCard key={o.id} order={o} onError={setError} />)}
        </QueryState>
      </div>
    </Screen>
  )
}

function OrderCard({ order, onError }: { order: SellerOrder; onError: (message: string | null) => void }) {
  const { data: disputes } = useDisputes()
  const dispatch = useDispatchOrder()
  const cancel = useCancelOrder()
  const dispute = disputes?.find((d) => d.ref_type === 'order' && d.ref_id === order.id && d.status === 'open')
  const open = order.status === 'placed' || order.status === 'dispatched'

  function doDispatch() {
    if (!window.confirm('Mark this order as sent? The customer is told it is on the way.')) return
    onError(null)
    dispatch.mutate(order.id, { onError: (e) => onError(friendlyError(e)) })
  }

  function doCancel() {
    if (!window.confirm(`Cancel this order? The customer gets their ${formatNaira(order.total)} back and the stock returns to sale.`)) return
    onError(null)
    cancel.mutate(order.id, { onError: (e) => onError(friendlyError(e)) })
  }

  return (
    <div className="bg-white border border-line rounded-2xl p-4 mt-3.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2">
          {shortId(order.id)} · {formatDateTime(order.placed_at)}
        </span>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="text-[15px] font-semibold text-ink mt-2.5">
        {order.order_items.map((it) => `${it.qty}× ${it.name}`).join(', ')}
      </div>
      <div className="text-[13.5px] text-muted-2 mt-1">
        {order.status === 'delivered'
          ? `Paid ${formatNaira(order.items_total - order.commission)} after the FindWork fee`
          : open
            ? `${formatNaira(order.items_total)} for the goods, held in escrow`
            : 'Refunded to the customer'}
      </div>

      {open && (
        <div className="bg-cream rounded-xl p-3 mt-3 text-[14px] leading-[1.5] text-text-soft">
          <div className="font-semibold text-ink">{order.customer?.full_name ?? 'Customer'}</div>
          {order.delivery_address}
          {order.contact_phone && <div className="text-muted-2 mt-0.5">{order.contact_phone}</div>}
          <div className="text-muted-2 mt-0.5">{order.delivery_speed === 'same-day' ? 'Same-day delivery' : 'Standard delivery'}</div>
        </div>
      )}

      {dispute ? (
        <Alert tone="info" className="mt-3">
          The customer reported a problem. The payment is on hold until our team settles it.{' '}
          <Link to={`/disputes/${dispute.id}`} className="font-semibold underline">
            View
          </Link>
        </Alert>
      ) : order.status === 'dispatched' ? (
        <p className="text-[13px] leading-[1.45] text-muted-2 mt-3">
          Sent {order.dispatched_at ? formatDateTime(order.dispatched_at) : ''}. You are paid when the customer confirms it
          arrived, or a week after sending if they report no problem.
        </p>
      ) : null}

      {order.status === 'placed' && !dispute && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={doDispatch}
            disabled={dispatch.isPending}
            className="flex-1 h-11 bg-ink text-cream rounded-lg text-[14px] font-semibold disabled:opacity-50"
          >
            Mark as sent
          </button>
          <button
            onClick={doCancel}
            disabled={cancel.isPending}
            className="flex-1 h-11 border border-line rounded-lg text-[14px] font-semibold text-muted disabled:opacity-50"
          >
            Cancel and refund
          </button>
        </div>
      )}
    </div>
  )
}

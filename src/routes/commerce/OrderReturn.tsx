import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Alert } from '../../components/ui/Alert'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useCancelOrder, useDisputes, useOrder } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira, shortId } from '../../lib/format'
import type { OrderStatus } from '../../lib/database.types'

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'placed', label: 'Order placed' },
  { status: 'dispatched', label: 'On the way' },
  { status: 'delivered', label: 'Delivered' },
]

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  switch (status) {
    case 'placed':
      return <Badge tone="warning" icon="clock">Preparing</Badge>
    case 'dispatched':
      return <Badge tone="danger" icon="moped">On the way</Badge>
    case 'delivered':
      return <Badge tone="success" icon="check-circle">Delivered</Badge>
    case 'returned':
      return <Badge tone="neutral">Refunded</Badge>
    default:
      return <Badge tone="neutral">Cancelled</Badge>
  }
}

/** One order: where it is, what was in it, and what to do if it goes wrong. */
export function OrderReturn() {
  const { orderId } = useParams<{ orderId: string }>()
  const { data: order, isLoading } = useOrder(orderId)
  const { data: disputes } = useDisputes()
  const cancel = useCancelOrder()
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <FullScreenLoader />
  if (!order) {
    return (
      <Screen>
        <PageHeader title="Order" back="/orders" />
        <EmptyState icon="ph-package" title="Order not found" />
      </Screen>
    )
  }

  const dispute = disputes?.find((d) => d.ref_type === 'order' && d.ref_id === order.id && d.status === 'open')
  const reached = STEPS.findIndex((s) => s.status === order.status)
  const closed = order.status === 'cancelled' || order.status === 'returned'

  async function doCancel() {
    if (!window.confirm(`Cancel this order? ${formatNaira(order!.total)} goes back to your wallet.`)) return
    setError(null)
    try {
      await cancel.mutateAsync(order!.id)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title={`Order ${shortId(order.id)}`} back="/orders" />
      <div className="px-[22px] pb-8">
        <div className="flex items-center justify-between bg-white border border-line rounded-2xl p-4 mt-4">
          <div>
            <OrderStatusBadge status={order.status} />
            <div className="text-[13.5px] text-muted mt-2">Placed {formatDateTime(order.placed_at)}</div>
          </div>
          <span className="font-display font-bold text-[18px] text-ink">{formatNaira(order.total)}</span>
        </div>

        {!closed && (
          <div className="mt-5">
            {STEPS.map((s, i) => {
              const done = i <= reached
              return (
                <div key={s.status} className="flex gap-3.5">
                  <span className="flex-none flex flex-col items-center">
                    <i className={`text-xl ${done ? 'ph-fill ph-check-circle text-success' : 'ph ph-circle text-[#C9C2B6]'}`} />
                    {i < STEPS.length - 1 && <span className={`w-0.5 flex-1 min-h-[22px] ${i < reached ? 'bg-success' : 'bg-line'}`} />}
                  </span>
                  <div className={`pb-3.5 text-[15px] font-semibold ${done ? 'text-ink' : 'text-muted-4'}`}>{s.label}</div>
                </div>
              )
            })}
          </div>
        )}

        {dispute && (
          <Alert tone="info" className="mt-4">
            You reported a problem with this order. Our team is looking at it.{' '}
            <Link to={`/disputes/${dispute.id}`} className="font-semibold underline">
              View
            </Link>
          </Alert>
        )}
        {error && <Alert className="mt-4">{error}</Alert>}

        <SectionLabel className="mt-5 mb-2.5">Items</SectionLabel>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {order.order_items.map((it, i) => (
            <div key={it.id} className={`flex gap-3.5 p-3.5 ${i < order.order_items.length - 1 ? 'border-b border-line-soft' : ''}`}>
              <PlaceholderImage className="w-[52px] h-[52px] flex-none" />
              <div className="flex-1">
                <Link to={`/product/${it.product_id}`} className="text-[15px] font-semibold text-ink">
                  {it.name}
                </Link>
                <div className="text-[13px] text-muted-2 mt-0.5">
                  {formatNaira(it.price)} · qty {it.qty}
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-between px-3.5 py-3 border-t border-line-soft text-[14px] text-text-soft">
            <span>Delivery ({order.delivery_speed})</span>
            <span className="text-ink">{formatNaira(order.delivery_fee)}</span>
          </div>
        </div>

        {order.delivery_address && (
          <>
            <SectionLabel className="mt-5 mb-2.5">Delivering to</SectionLabel>
            <div className="bg-white border border-line rounded-2xl p-4 text-[14.5px] leading-[1.5] text-text-soft">
              {order.delivery_address}
              {order.contact_phone && <div className="text-muted-2 mt-1">{order.contact_phone}</div>}
            </div>
          </>
        )}

        {order.status === 'placed' && !dispute && (
          <button
            onClick={doCancel}
            disabled={cancel.isPending}
            className="flex items-center justify-center w-full h-12 mt-5 border-[1.5px] border-ink rounded-xl text-[15.5px] font-semibold text-ink disabled:opacity-50"
          >
            Cancel order for a full refund
          </button>
        )}
        {(order.status === 'dispatched' || order.status === 'delivered') && !dispute && (
          <Link
            to={`/disputes/new/order/${order.id}`}
            className="flex items-center justify-center w-full h-12 mt-5 border-[1.5px] border-ink rounded-xl text-[15.5px] font-semibold text-ink"
          >
            {order.status === 'delivered' ? 'Something wrong? Request a return' : 'Report a problem'}
          </Link>
        )}
      </div>
    </Screen>
  )
}

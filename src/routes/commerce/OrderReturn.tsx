import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Badge } from '../../components/ui/Badge'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function OrderReturn() {
  const { orderId } = useParams<{ orderId: string }>()
  const orders = useAppStore((s) => s.orders)
  const order = orders.find((o) => o.id === orderId) ?? orders[0]

  if (!order) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-[22px] pt-6 text-center text-sm text-muted">No orders yet.</div>
      </Screen>
    )
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/shop" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Order {order.id}</span>
        </div>

        <div className="flex items-center justify-between bg-white border border-line rounded-2xl p-4 mt-4">
          <div>
            <Badge tone="success" icon="check-circle">Delivered</Badge>
            <div className="text-[13.5px] text-muted mt-2">{order.placedAt}</div>
          </div>
          <Link to={`/track/${order.id}`} className="text-sm font-semibold text-brand-hover">See route</Link>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Items</div>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {order.items.map((it, i) => (
            <div key={it.productId} className={`flex gap-3.5 p-3.5 ${i < order.items.length - 1 ? 'border-b border-line-soft' : ''}`}>
              <PlaceholderImage className="w-[52px] h-[52px] flex-none" />
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-ink">{it.name}</div>
                <div className="text-[13px] text-muted-2 mt-0.5">{formatNaira(it.price)} · qty {it.qty}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Something wrong?</div>
        <div className="bg-white border border-line rounded-2xl p-[18px]">
          <div className="font-display font-semibold text-[16.5px] text-ink">Request a return</div>
          <p className="mt-1.5 text-[14.5px] leading-[1.5] text-muted">
            You have 5 days left to return these items. Add photos and we will hold the vendor payout while we
            look.
          </p>
          <div className="flex gap-2.5 mt-3.5">
            <PlaceholderImage className="w-16 h-16" />
            <div className="w-16 h-16 border-[1.5px] border-dashed border-[#C9A99E] rounded-lg flex items-center justify-center text-muted-2">
              <i className="ph ph-camera text-xl" />
            </div>
          </div>
          <Link
            to={`/disputes/new/${order.id}`}
            className="flex items-center justify-center h-12 mt-4 border-[1.5px] border-ink rounded-lg text-[15.5px] font-semibold text-ink"
          >
            Start a return
          </Link>
        </div>

        <Link
          to="/shop"
          className="flex items-center justify-center h-[52px] mt-3.5 bg-ink rounded-xl text-[16px] font-semibold text-cream"
        >
          Buy these again
        </Link>
      </div>
    </Screen>
  )
}

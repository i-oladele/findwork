import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { Badge } from '../../components/ui/Badge'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { useAppStore } from '../../store/appStore'

const steps = [
  { label: 'Order confirmed', time: '9:04', done: true },
  { label: 'Picked up from vendor', time: '9:26', done: true },
  { label: 'On the way to you', time: 'Now · 2.4 km away', active: true },
  { label: 'Delivered', time: 'Est. 9:53' },
]

export function TrackDelivery() {
  const { orderId } = useParams<{ orderId: string }>()
  const orders = useAppStore((s) => s.orders)
  const order = orders.find((o) => o.id === orderId) ?? orders[0]
  const itemCount = order?.items.reduce((sum, it) => sum + it.qty, 0) ?? 0
  const vendorCount = order ? new Set(order.items.map((it) => it.name)).size : 0

  return (
    <Screen>
      <div className="relative h-[340px] bg-line-soft">
        <iframe title="Rider route through Yaba, Lagos" src="/map-yaba.html" className="absolute inset-0 w-full h-full border-0" />
        <div className="relative h-11 flex items-center justify-between px-[22px] font-mono text-xs text-ink bg-gradient-to-b from-cream/90 to-cream/0">
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <i className="ph-fill ph-cell-signal-full text-[13px]" />
            <i className="ph-fill ph-wifi-high text-[13px]" />
            <i className="ph-fill ph-battery-full text-sm" />
          </span>
        </div>
        <Link to={`/order/${order?.id ?? 'FW-90311'}`} className="relative inline-flex items-center justify-center w-11 h-11 ml-3 rounded-full bg-white/92 text-ink">
          <i className="ph-bold ph-arrow-left text-xl" />
        </Link>
      </div>

      <div className="px-[22px] pt-5">
        <Badge tone="danger" icon="moped">On the way</Badge>
        <h2 className="mt-3.5 font-display font-bold text-[28px] leading-[1.1] tracking-[-0.025em] text-ink">
          Arriving in 12 minutes
        </h2>
        <p className="mt-2 text-[15px] text-muted">
          Order {order?.id ?? 'FW-90311'} · {itemCount} item{itemCount === 1 ? '' : 's'} from {vendorCount} vendor{vendorCount === 1 ? '' : 's'}
        </p>

        <div className="flex items-center gap-3.5 bg-white border border-line rounded-2xl p-3.5 mt-[18px]">
          <PlaceholderImage shape="circle" className="w-12 h-12 flex-none" />
          <div className="flex-1">
            <div className="text-[15.5px] font-semibold text-ink">Emeka · rider</div>
            <div className="flex items-center gap-1.5 text-[12.5px] text-muted-2 mt-0.5">
              <i className="ph-fill ph-star text-warning text-xs" />
              4.9 · Okada · LAG 442 XZ
            </div>
          </div>
          <Link to="/chat/emeka-rider" className="inline-flex items-center justify-center w-11 h-11 border border-line rounded-lg text-ink">
            <i className="ph ph-chat-circle-dots text-lg" />
          </Link>
          <span className="inline-flex items-center justify-center w-11 h-11 bg-success rounded-lg text-white">
            <i className="ph-fill ph-phone text-lg" />
          </span>
        </div>

        <div className="mt-5">
          {steps.map((s, i) => (
            <div key={s.label} className="flex gap-3.5">
              <span className="flex-none flex flex-col items-center">
                <i
                  className={`text-xl ${
                    s.done
                      ? 'ph-fill ph-check-circle text-success'
                      : s.active
                        ? 'ph-fill ph-circle text-brand'
                        : 'ph ph-circle text-[#C9C2B6]'
                  }`}
                />
                {i < steps.length - 1 && (
                  <span className={`w-0.5 flex-1 min-h-[26px] ${s.done ? 'bg-success' : 'bg-line'}`} />
                )}
              </span>
              <div className="pb-4">
                <div className={`text-[15px] font-semibold ${s.done || s.active ? 'text-ink' : 'text-muted-4'}`}>
                  {s.label}
                </div>
                <div className={`text-[12.5px] mt-0.5 ${s.done || s.active ? 'text-muted-2' : 'text-muted'}`}>
                  {s.time}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  )
}

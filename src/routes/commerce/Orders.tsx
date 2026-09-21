import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Card } from '../../components/ui/Card'
import { QueryState } from '../../components/system/QueryState'
import { useOrders } from '../../lib/api'
import { formatDateTime, formatNaira, shortId } from '../../lib/format'
import { OrderStatusBadge } from './OrderReturn'

export function Orders() {
  const orders = useOrders()

  return (
    <Screen>
      <PageHeader title="My orders" back="/shop" />
      <div className="px-[22px] pb-6">
        <QueryState
          query={orders}
          errorMessage="We could not load your orders."
          empty={{
            icon: 'ph-package',
            title: 'No orders yet',
            action: (
              <Link to="/shop" className="text-[15px] font-semibold text-brand-hover">
                Browse the shop
              </Link>
            ),
          }}
        >
          {(list) =>
            list.map((o) => {
              const count = o.order_items.reduce((sum, it) => sum + it.qty, 0)
              return (
                <Card key={o.id} to={`/order/${o.id}`} className="p-4 mt-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2">
                      {shortId(o.id)} · {formatDateTime(o.placed_at)}
                    </span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <div className="flex items-baseline justify-between mt-2.5">
                    <span className="text-[14.5px] text-text-soft truncate pr-3">
                      {o.order_items.map((it) => it.name).join(', ')}
                    </span>
                    <span className="font-display font-bold text-[15.5px] text-ink whitespace-nowrap">{formatNaira(o.total)}</span>
                  </div>
                  <div className="text-[12.5px] text-muted-2 mt-1">
                    {count} item{count === 1 ? '' : 's'}
                  </div>
                </Card>
              )
            })
          }
        </QueryState>
      </div>
    </Screen>
  )
}

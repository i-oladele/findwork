import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { QueryState } from '../../components/system/QueryState'
import { useProducts } from '../../lib/api'
import { useCartCount } from '../../store/cart'
import { formatNaira } from '../../lib/format'

export function Shop() {
  const cartCount = useCartCount()
  const products = useProducts()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = products.data?.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q),
  )

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-2 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">Shop</h2>
          <Link to="/orders" className="text-[14.5px] font-semibold text-brand-hover">
            My orders
          </Link>
        </div>
        <div className="flex items-center gap-2.5 mt-3">
          <div className="flex-1 flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[46px] px-3">
            <i className="ph ph-magnifying-glass text-lg text-muted-2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products"
              className="flex-1 min-w-0 text-[15.5px] text-ink bg-transparent outline-none placeholder:text-muted-2"
            />
          </div>
          <Link
            to="/cart"
            aria-label={`Cart, ${cartCount} items`}
            className="relative inline-flex items-center justify-center w-[46px] h-[46px] bg-ink rounded-lg text-white"
          >
            <i className="ph ph-shopping-cart text-xl" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] rounded-full bg-brand text-white font-mono text-[10.5px] flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        </div>

        <div className="flex items-start gap-2.5 bg-white border border-line rounded-2xl px-3.5 py-3 mt-4">
          <i className="ph-fill ph-truck text-lg text-success relative top-0.5" />
          <p className="text-[13.5px] leading-[1.45] text-text-soft">
            Delivered across Lagos by FindWork. Standard {formatNaira(1200)}, same-day {formatNaira(1800)}. Cancel
            for a full refund until it is dispatched.
          </p>
        </div>

        <div className="mt-2">
          <QueryState
            query={{ ...products, data: filtered }}
            errorMessage="We could not load the shop."
            empty={{ icon: 'ph-storefront', title: q ? 'Nothing matches' : 'The shop is empty' }}
          >
            {(list) => (
              <div className="grid grid-cols-2 gap-2.5 mt-2">
                {list.map((p) => (
                  <Link key={p.id} to={`/product/${p.id}`} className="bg-white border border-line rounded-2xl overflow-hidden">
                    <PlaceholderImage src={p.image_url ?? undefined} className="h-[96px] w-full rounded-none" />
                    <div className="px-3 py-2.5">
                      <div className="text-[14.5px] font-semibold text-ink leading-[1.3]">{p.name}</div>
                      <div className="font-display font-bold text-base text-ink mt-2">{formatNaira(p.price)}</div>
                      <div className="text-[11.5px] text-muted mt-1.5 truncate">{p.vendor}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </QueryState>
        </div>
      </div>
    </Screen>
  )
}

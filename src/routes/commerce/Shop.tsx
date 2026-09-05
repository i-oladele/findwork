import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { Chip } from '../../components/ui/Chip'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { products, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function Shop() {
  const cartCount = useAppStore((s) => s.cart.reduce((sum, l) => sum + l.qty, 0))
  return (
    <Screen bottomNav="customer">
      <div className="px-[22px] pt-2">
        <div className="h-11 flex items-center justify-between font-mono text-xs text-ink">
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <i className="ph-fill ph-cell-signal-full text-[13px]" />
            <i className="ph-fill ph-wifi-high text-[13px]" />
            <i className="ph-fill ph-battery-full text-sm" />
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex-1 flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[46px] px-3">
            <i className="ph ph-magnifying-glass text-lg text-muted-2" />
            <span className="text-[15.5px] text-muted-2">Search products</span>
          </div>
          <Link to="/cart" className="relative inline-flex items-center justify-center w-[46px] h-[46px] bg-ink rounded-lg text-white">
            <i className="ph ph-shopping-cart text-xl" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] rounded-full bg-brand text-white font-mono text-[10.5px] flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        </div>

        <div className="flex gap-2 mt-3.5">
          <Chip active>All</Chip>
          <Chip>Fabric</Chip>
          <Chip>Food</Chip>
        </div>

        <Link to="/product/ankara-wax-print" className="block bg-ink rounded-2xl overflow-hidden mt-4">
          <div className="relative h-24 bg-[#3A332B]">
            <PlaceholderImage src="/assets/img-vendor.webp" className="absolute inset-0 rounded-none w-full h-full" />
          </div>
          <div className="px-[18px] py-3.5">
            <span className="inline-block bg-brand text-white rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.12em] uppercase font-bold">
              Market day
            </span>
            <div className="font-display font-bold text-xl text-cream mt-2.5">Ankara bundles from ₦4,500</div>
            <div className="text-[13.5px] text-muted-3 mt-1">Free delivery in Lagos over ₦20,000</div>
          </div>
        </Link>

        <div className="flex items-center justify-between mt-4">
          <div className="font-display font-bold text-[19px] text-ink">Vendors near you</div>
          <Link to="/product/ankara-wax-print" className="text-sm font-semibold text-brand-hover">See all</Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-3">
          {products.map((p) => (
            <Link key={p.id} to={`/product/${p.id}`} className="bg-white border border-line rounded-2xl overflow-hidden">
              <PlaceholderImage className="h-[88px] w-full rounded-none" />
              <div className="px-3 py-2.5">
                <div className="text-[14.5px] font-semibold text-ink leading-[1.3]">{p.name}</div>
                <div className="font-display font-bold text-base text-ink mt-2">{formatNaira(p.price)}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <i className="ph-fill ph-shield-check text-[13px] text-success" />
                  <span className="text-[11.5px] text-muted">{p.vendor}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Screen>
  )
}
